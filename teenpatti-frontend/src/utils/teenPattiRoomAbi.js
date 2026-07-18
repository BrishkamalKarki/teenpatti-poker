/**
 * Minimal ABI for TeenPattiRoom.sol — only what the frontend calls or listens for.
 * Regenerate from the Foundry build artifact if the contract changes:
 *   forge build && jq '.abi' out/TeenPattiRoom.sol/TeenPattiRoom.json
 */
export const TEENPATTI_ROOM_ABI = [
  'function createRoom(uint8 maxPlayers, uint256 bootAmount) payable returns (uint256 roomId)',
  'function joinRoom(uint256 roomId) payable',
  'function startRound(uint256 roomId)',
  'function placeBet(uint256 roomId) payable',
  'function settleRound(uint256 roomId, address[] winners, uint256[] amounts)',
  'function withdraw()',
  'function closeRoom(uint256 roomId)',
  'function getPlayers(uint256 roomId) view returns (address[])',
  'function rooms(uint256) view returns (address host, uint8 maxPlayers, uint8 playerCount, uint256 bootAmount, uint256 pot, uint8 state)',
  'function pendingWithdrawals(address) view returns (uint256)',
  'function roomCount() view returns (uint256)',

  'event RoomCreated(uint256 indexed roomId, address indexed host, uint8 maxPlayers, uint256 bootAmount)',
  'event PlayerJoined(uint256 indexed roomId, address indexed player, uint256 entryFeePaid, uint8 playerCount)',
  'event RoundStarted(uint256 indexed roomId)',
  'event BetPlaced(uint256 indexed roomId, address indexed player, uint256 amount, uint256 newPot)',
  'event RoundSettled(uint256 indexed roomId, address[] winners, uint256[] amounts)',
  'event Withdrawn(address indexed player, uint256 amount)',
  'event RoomClosed(uint256 indexed roomId)',
];

export const ROOM_STATE = { 0: 'Open', 1: 'Playing', 2: 'Closed' };
