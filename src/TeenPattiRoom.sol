// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title TeenPattiRoom
/// @notice On-chain room + escrow layer for a Teen Patti table.
/// @dev This contract deliberately knows NOTHING about cards, hands, or turns.
///      All of that lives in the off-chain engine (teenPattiEngine.js). The
///      contract's only job is: hold real ETH for entry fees and bets, and
///      pay out whatever the room's host reports as the round result. The
///      host is trusted here the same way `onlyOwner` is trusted in
///      PDSCWorkshop2026 — swap to a backend-signer model later if needed.
contract TeenPattiRoom is Ownable {
    enum RoomState {
        Open, // accepting players, no round in progress
        Playing, // a round is currently being played off-chain
        Closed // room finished, no further joins or bets

    }

    struct Room {
        address host;
        uint8 maxPlayers;
        uint8 playerCount;
        uint256 bootAmount; // minimum entry fee / boot for this room
        uint256 pot; // ETH currently escrowed for the active round
        RoomState state;
    }

    error ZeroAddress();
    error RoomNotFound();
    error NotHost();
    error RoomFull();
    error AlreadyJoined();
    error NotAPlayer();
    error InvalidMaxPlayers();
    error InvalidRoomState();
    error IncorrectEntryFee(uint256 expected, uint256 sent);
    error ZeroBet();
    error NotEnoughPlayers();
    error PayoutMismatch(uint256 pot, uint256 totalPayout);
    error ArrayLengthMismatch();
    error NothingToWithdraw();
    error TransferFailed();

    uint256 public roomCount;
    mapping(uint256 => Room) public rooms;
    mapping(uint256 => address[]) public roomPlayers;
    mapping(uint256 => mapping(address => bool)) public isPlayerInRoom;

    /// @dev Pull-payment balances. Winnings land here instead of being
    ///      pushed directly, so a misbehaving winner address can never
    ///      block settlement or open a reentrancy path.
    mapping(address => uint256) public pendingWithdrawals;

    event RoomCreated(uint256 indexed roomId, address indexed host, uint8 maxPlayers, uint256 bootAmount);
    event PlayerJoined(uint256 indexed roomId, address indexed player, uint256 entryFeePaid, uint8 playerCount);
    event RoundStarted(uint256 indexed roomId);
    event BetPlaced(uint256 indexed roomId, address indexed player, uint256 amount, uint256 newPot);
    event RoundSettled(uint256 indexed roomId, address[] winners, uint256[] amounts);
    event Withdrawn(address indexed player, uint256 amount);
    event RoomClosed(uint256 indexed roomId);

    modifier onlyHost(uint256 roomId) {
        if (rooms[roomId].host == address(0)) revert RoomNotFound();
        if (rooms[roomId].host != msg.sender) revert NotHost();
        _;
    }

    modifier onlyPlayer(uint256 roomId) {
        if (!isPlayerInRoom[roomId][msg.sender]) revert NotAPlayer();
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {
        if (initialOwner == address(0)) revert ZeroAddress();
    }

    /// @notice Create a room. Caller becomes host and is auto-seated as player 1.
    function createRoom(uint8 maxPlayers, uint256 bootAmount) external payable returns (uint256 roomId) {
        if (maxPlayers < 2 || maxPlayers > 10) revert InvalidMaxPlayers();
        if (msg.value != bootAmount) revert IncorrectEntryFee(bootAmount, msg.value);

        roomId = roomCount++;
        rooms[roomId] = Room({
            host: msg.sender,
            maxPlayers: maxPlayers,
            playerCount: 1,
            bootAmount: bootAmount,
            pot: msg.value,
            state: RoomState.Open
        });

        roomPlayers[roomId].push(msg.sender);
        isPlayerInRoom[roomId][msg.sender] = true;

        emit RoomCreated(roomId, msg.sender, maxPlayers, bootAmount);
        emit PlayerJoined(roomId, msg.sender, msg.value, 1);
    }

    /// @notice Join an existing open room by paying its boot amount.
    function joinRoom(uint256 roomId) external payable {
        Room storage room = rooms[roomId];
        if (room.host == address(0)) revert RoomNotFound();
        if (room.state != RoomState.Open) revert InvalidRoomState();
        if (room.playerCount >= room.maxPlayers) revert RoomFull();
        if (isPlayerInRoom[roomId][msg.sender]) revert AlreadyJoined();
        if (msg.value != room.bootAmount) revert IncorrectEntryFee(room.bootAmount, msg.value);

        room.playerCount++;
        room.pot += msg.value;
        roomPlayers[roomId].push(msg.sender);
        isPlayerInRoom[roomId][msg.sender] = true;

        emit PlayerJoined(roomId, msg.sender, msg.value, room.playerCount);
    }

    /// @notice Host flips the room to Playing once enough players are seated.
    ///         Call this right before kicking off `startRound()` in the off-chain engine.
    function startRound(uint256 roomId) external onlyHost(roomId) {
        Room storage room = rooms[roomId];
        if (room.state != RoomState.Open) revert InvalidRoomState();
        if (room.playerCount < 2) revert NotEnoughPlayers();

        room.state = RoomState.Playing;
        emit RoundStarted(roomId);
    }

    /// @notice Place a bet for the current round. Amount is whatever the
    ///         off-chain engine says is owed (blind stake, seen stake, raise, etc.);
    ///         the contract just escrows it and lets the frontend/backend
    ///         reconcile it against engine state via the BetPlaced event.
    function placeBet(uint256 roomId) external payable onlyPlayer(roomId) {
        Room storage room = rooms[roomId];
        if (room.state != RoomState.Playing) revert InvalidRoomState();
        if (msg.value == 0) revert ZeroBet();

        room.pot += msg.value;
        emit BetPlaced(roomId, msg.sender, msg.value, room.pot);
    }

    /// @notice Host reports the round result from the off-chain engine and the
    ///         pot is distributed accordingly. Supports split pots (ties).
    ///         winners/amounts must sum to exactly the current pot.
    function settleRound(uint256 roomId, address[] calldata winners, uint256[] calldata amounts)
        external
        onlyHost(roomId)
    {
        Room storage room = rooms[roomId];
        if (room.state != RoomState.Playing) revert InvalidRoomState();
        if (winners.length != amounts.length) revert ArrayLengthMismatch();

        uint256 total;
        for (uint256 i = 0; i < amounts.length; i++) {
            total += amounts[i];
        }
        if (total != room.pot) revert PayoutMismatch(room.pot, total);

        for (uint256 i = 0; i < winners.length; i++) {
            if (winners[i] == address(0)) revert ZeroAddress();
            pendingWithdrawals[winners[i]] += amounts[i];
        }

        room.pot = 0;
        room.state = RoomState.Open;

        emit RoundSettled(roomId, winners, amounts);
    }

    /// @notice Pull payment — winners withdraw their accumulated balance whenever they like.
    function withdraw() external {
        uint256 amount = pendingWithdrawals[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        pendingWithdrawals[msg.sender] = 0;

        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();

        emit Withdrawn(msg.sender, amount);
    }

    /// @notice Host closes the room once no round is in progress and the pot is empty.
    function closeRoom(uint256 roomId) external onlyHost(roomId) {
        Room storage room = rooms[roomId];
        if (room.state != RoomState.Open) revert InvalidRoomState();
        if (room.pot != 0) revert InvalidRoomState();

        room.state = RoomState.Closed;
        emit RoomClosed(roomId);
    }

    /// @notice Convenience view for the frontend: full seated player list for a room.
    function getPlayers(uint256 roomId) external view returns (address[] memory) {
        return roomPlayers[roomId];
    }
}
