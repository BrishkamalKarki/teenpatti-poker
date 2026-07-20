// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title TeenPattiGame
/// @notice each single room is a single game

// forming the contract named TeenPattiGame
contract TeenPattiGame{
  
  // defining the constants in here
  uint8 public constant MAX_PLAYERS = 4;
  uint8 public constant MIN_PLAYERS = 2;

  uint256 public constant MIN_ENTRY_FEE = 0.0001 ether;
  uint256 public constant MAX_ENTRY_FEE = 1 ether;

  enum Status{
    Open, // state where player are allowed to join the game
    Playing, // state of the running game, no players can enter and the bets are allowed
    Finished // room is dead and pot is paid to the winner
  }

  // for storing in the contract
  struct Game{
    bytes5 code; // this stores the room code
    address host; // this stores the host public address
    uint256 entryFee; // this stores the entry ETHs fee
    uint256 pot; // total ETHs collected in the game
    Status status; // saves the current status of the game
    uint8 playerCount; // no of player joined till now
    uint8 maxPlayers; // max no of player that can be joined in this particular room
  }

  // for providing to the frontend
  struct GameView{
    uint256 gameId; // room id = instant gameCount
    bytes5 code; // room code
    address host; 
    uint256 entryFee;
    uint256 pot;
    Status status;
    uint8 playerCount;
    uint8 maxPlayers;
    address[] players; // list of address of the players joined 
  }

  uint256 public gameCount; // no of room count

  mapping(uint256 => Game) private games; // for each game/room stores a game data = game struct
  mapping(bytes5 => uint256) private roomGame; // mapping the room code with game id (with +1)
  mapping(uint256 => address[]) private _players; // storing the list of the player for each game id
  mapping(uint256 => mapping(address => bool)) public isPlayer; // for each game stores the list of player with their value as already joined or not - entered - true
  mapping(uint256 => mapping(address => uint256)) public ttlPay; // for each game how much each of the player has put the ETHs
  mapping(address => uint256) public pendingWithdrawal; // in case if any transaction fails for the winner

  // declaring the errors 
  error CodeAlreadyUsed();
  error CodeRequired();
  error EntryFeeOutOfRange(uint256 min, uint256 max, uint256 given);
  error WrongEntryFee(uint256 required, uint256 sent);
  error InvalidMaxPlayers();
  error NoSuchGame();
  error NotHost();
  error NotAPlayer();
  error GameNotOpen();
  error GameNotPlaying();
  error GameFull();
  error AlreadyJoined();
  error NotEnoughPlayers();
  error ZeroBet();
  error NoWinners();
  error TooManyWinners();
  error DuplicateWinner();
  error NothingToClaim();
  error TransferFailed();

  // declaring the events
  event GameCreated(uint256 indexed gameId, bytes5 indexed code, address indexed host, uint entryFee);
  event PlayerJoined(uint256 indexed gameId, address indexed player, uint256 entryFee, uint8 playerCount);
  event GameStarted(uint256 indexed gameId, uint8 playerCount, uint256 pot);
  event BetPlaced(uint256 indexed gameId, address indexed player, uint256 amount, uint256 pot);
  event GameFinished(uint256 indexed gameId, address[] winners, uint256 amountEach);
  event GameAborted(uint256 indexed gameId);
  event Claimed(address indexed player, uint256 amount);

  // checking if the game is present or not
  modifier gameExists(uint256 gameId){
    if (games[gameId].host == address(0)) revert NoSuchGame();
    _;
  }

  // cheking if the sender is the host for the specific operations
  modifier onlyHost(uint256 gameId){
    if (games[gameId].host == address(0)) revert NoSuchGame();
    if (games[gameId].host != msg.sender) revert NotHost();
    _;
  }

  // initial game creation
  function createGame(bytes5 code, uint256 entryFee, uint8 maxPlayers) external payable returns (uint256 gameId){
    // checking the errors
    if (code == bytes5(0)) revert CodeRequired();
    if (roomGame[code] != 0) revert CodeAlreadyUsed();
    if (entryFee < MIN_ENTRY_FEE || entryFee > MAX_ENTRY_FEE){
          revert EntryFeeOutOfRange(MIN_ENTRY_FEE, MAX_ENTRY_FEE, entryFee);
    }
    if (maxPlayers < MIN_PLAYERS || maxPlayers > MAX_PLAYERS) revert InvalidMaxPlayers();
    if (msg.value != entryFee) revert WrongEntryFee(entryFee, msg.value);
    gameId = gameCount++;
    roomGame[code] = gameId + 1;

    games[gameId] = Game({
      code: code,
      host: msg.sender,
      entryFee: entryFee,
      pot: msg.value,
      status: Status.Open,
      playerCount: 1,
      maxPlayers: maxPlayers
    });

    _players[gameId].push(msg.sender);
    isPlayer[gameId][msg.sender] = true;
    ttlPay[gameId][msg.sender] = msg.value;

    emit GameCreated(gameId, code, msg.sender, entryFee);
    emit PlayerJoined(gameId, msg.sender, entryFee, 1);
  }

  // gives the game id
  function gameIdByCode(bytes5 code) public view returns (uint256){
    uint256 idPlusOne = roomGame[code];
    if (idPlusOne == 0) revert NoSuchGame();
    return idPlusOne - 1;
  }

  // sending the amount to the winners address
  function _payout(address to, uint256 amount) private{
    if (amount == 0) return;
    (bool ok,) = to.call{value: amount}("");
    if (!ok) pendingWithdrawal[to] += amount;
  }

  // joining the game
  function joinGame(bytes5 code) external payable returns (uint256 gameId){
    // getting the game id
    gameId = gameIdByCode(code);
    Game storage game = games[gameId];

    if (game.status != Status.Open) revert GameNotOpen();
    if (game.playerCount >= game.maxPlayers) revert GameFull();
    if (isPlayer[gameId][msg.sender]) revert AlreadyJoined();
    if (msg.value != game.entryFee) revert WrongEntryFee(game.entryFee, msg.value);

    game.playerCount += 1;
    game.pot += msg.value;
    // including the address fo the player in the list
    _players[gameId].push(msg.sender);
    isPlayer[gameId][msg.sender] = true;
    // increasing the total pot of the each player
    ttlPay[gameId][msg.sender] = msg.value;

    emit PlayerJoined(gameId, msg.sender, msg.value, game.playerCount);
  }

  // starting the game
  function startGame(uint256 gameId) external onlyHost(gameId){
    Game storage game = games[gameId];
    if (game.status != Status.Open) revert GameNotOpen();
    if (game.playerCount < MIN_PLAYERS) revert NotEnoughPlayers();

    game.status = Status.Playing;
    emit GameStarted(gameId, game.playerCount, game.pot);
  }

  // betting in the each round
  function bet(uint256 gameId) external payable gameExists(gameId){
    Game storage game = games[gameId];
    if (game.status != Status.Playing) revert GameNotPlaying();
    if (!isPlayer[gameId][msg.sender]) revert NotAPlayer();
    if (msg.value == 0) revert ZeroBet();

    game.pot += msg.value;
    ttlPay[gameId][msg.sender] += msg.value;

    emit BetPlaced(gameId, msg.sender, msg.value, game.pot);
  }

  // winners is the list of the address of the game winners
  function finishGame(uint256 gameId, address[] calldata winners) external onlyHost(gameId){
    Game storage game = games[gameId];
    if (game.status != Status.Playing) revert GameNotPlaying();
    if (winners.length == 0) revert NoWinners();
    if (winners.length > MAX_PLAYERS) revert TooManyWinners();

    // validating the winner
    for (uint256 i = 0; i < winners.length; i++){
      if (!isPlayer[gameId][winners[i]]) revert NotAPlayer();
      for (uint256 j = 0; j < i; j++){
          if (winners[j] == winners[i]) revert DuplicateWinner();
      }
    }

    // setting the ending statuses and values
    uint256 pot = game.pot;
    game.pot = 0;
    game.status = Status.Finished;

    uint256 share = pot / winners.length;
    uint256 remainder = pot - share * winners.length;

    emit GameFinished(gameId, winners, share);

    // seding the amount to the winner address
    // splitting the money in case of draws
    for (uint256 i = 0; i < winners.length; i++){
      uint256 amount = share + (i == 0 ? remainder : 0);
      _payout(winners[i], amount);
    }
  }

  // aborting the game by the host
  function abortGame(uint256 gameId) external onlyHost(gameId){
    Game storage game = games[gameId];
    if (game.status != Status.Open) revert GameNotOpen();

    game.pot = 0;
    game.status = Status.Finished;

    address[] storage list = _players[gameId];
    for (uint256 i = 0; i < list.length; i++){
      uint256 refund = ttlPay[gameId][list[i]];
      ttlPay[gameId][list[i]] = 0;
      _payout(list[i], refund);
    }

    emit GameAborted(gameId);
  }

  // claiming the amount bet
  function claim() external{
    uint256 amount = pendingWithdrawal[msg.sender];
    if (amount == 0) revert NothingToClaim();
    pendingWithdrawal[msg.sender] = 0;

    (bool ok,) = msg.sender.call{value: amount}("");
    if (!ok) revert TransferFailed();

    emit Claimed(msg.sender, amount);
  }

  // giving the frontend every thing that it needs
  function getGame(uint256 gameId) public view gameExists(gameId) returns (GameView memory){
    Game storage game = games[gameId];
    return GameView({
        gameId: gameId,
        code: game.code,
        host: game.host,
        entryFee: game.entryFee,
        pot: game.pot,
        status: game.status,
        playerCount: game.playerCount,
        maxPlayers: game.maxPlayers,
        players: _players[gameId]
    });
  }

  function getGameByCode(bytes5 code) external view returns (GameView memory){ // returns the copy of the GameView struct
    return getGame(gameIdByCode(code));
  }

  function getStakes(uint256 gameId) external view returns (address[] memory players, uint256[] memory amounts){
    players = _players[gameId];
    amounts = new uint256[](players.length);
    for (uint256 i = 0; i < players.length; i++) {
        amounts[i] = ttlPay[gameId][players[i]];
    }
  }
}