# तीन पत्ती (Teen Patti Nepal) — Frontend

Adapted from the poker-frontend base you already had, restyled for Nepali Teen
Patti rules and wired to `TeenPattiRoom.sol` for real ETH bets on Anvil.

## What changed vs. the poker base

| Poker (base)                          | Teen Patti (this)                                             |
|----------------------------------------|-----------------------------------------------------------------|
| `pokerEngine.js`, `handEvaluator.js`   | `teenPattiEngine.js`, `teenPattiEvaluator.js`                  |
| 2 hole cards + 5 community cards       | 3 cards per player, **no** community cards                      |
| Fold / Check / Call / Raise            | पास (Pack) / देख्नुहोस् (See) / चाल (Chaal) / रेज (Raise) / शो (Show) |
| `PokerTable.jsx`                       | `TeenPattiTable.jsx` (pot + stake only, no `CommunityCards`)    |
| `walletService.js` — empty stub        | `walletService.js` — real `ethers.js` calls to `TeenPattiRoom.sol` |
| Bottle-green felt / brass ("Felt & Fortune") | Maroon velvet felt / gold + Nepal-flag crimson & blue          |
| Latin-only labels                      | Devanagari labels throughout (`Noto Sans Devanagari`, `Yatra One`) |

Everything else — `RoomContext.jsx`, `useRoom.js`, `socketService.js`,
`seatPositions.js`, `deck.js`, `Button`/`ChipStack`/`PlayingCard` — is
untouched, because it was already game-agnostic.

## How the pieces fit together (matches the blockchain workflow we designed)

1. **Lobby → Create Room**: host picks player count + boot amount (in ETH),
   signs a transaction via `walletService.createRoomOnChain()` — this is the
   *real* on-chain `createRoom()` call on `TeenPattiRoom.sol`. The returned
   `roomId` is then used as the socket room code too, so one code opens both
   the game state and the contract room.
2. **Lobby → Join Room**: reads the room's boot amount straight from the
   contract (`getRoomOnChain`), pays it (`joinRoomOnChain`), then joins the
   socket room.
3. **In-room actions**: `ActionBar` fires the socket action first — this
   updates `teenPattiEngine.js`'s authoritative state instantly — then, for
   money-moving actions (`bet`, `show`), also submits the matching
   `placeBetOnChain()` transaction. `seeCards` and `pack` never touch the
   chain, since no ETH moves.
4. **Round end**: once `teenPattiEngine.js` resolves a round, the host gets a
   "चेनमा भुक्तानी पुष्टि गर्नुहोस्" (Settle on-chain) button, which calls
   `settleRoundOnChain()` with the exact winners/amounts the engine computed
   — this is the contract's `settleRound()`, paying out via the pull-payment
   `pendingWithdrawals` balance.

## ⚠️ Units convention

Everywhere in this app — `chips`, `bootAmount`, `stake`, bet amounts — are
**plain ETH values** (e.g. `0.01`), not wei, not an abstract chip count. This
keeps `teenPattiEngine.js` (plain JS numbers) and `TeenPattiRoom.sol` (wants
ETH) trivially in sync — `walletService.js` is the only place that ever calls
`parseEther`/`formatEther`. If you'd rather have a real chip economy
decoupled from ETH's price, that's the "Option B: ERC20 chip token" upgrade
we talked about — not implemented here on purpose, see the contract-design
conversation for why.

## Setup

```bash
cp .env.example .env
# fill in VITE_TEENPATTI_CONTRACT_ADDRESS after `forge create TeenPattiRoom.sol`
npm install
npm run dev
```

You'll also need:
- Anvil running (`anvil`) with `TeenPattiRoom.sol` deployed to it
- Your existing Node/socket.io backend, updated to run `teenPattiEngine.js`
  instead of `pokerEngine.js`, and to accept the optional `roomCode` field on
  `room:create` (see `socketService.js` — currently just forwarded through;
  your backend should honor it if present so the socket room code matches the
  on-chain `roomId`, otherwise it can keep auto-generating as before)

## What's intentionally left as a seam, not built

- **No side-show** (private mid-round card comparison) — documented in
  `teenPattiEngine.js` as a deliberate v1 simplification.
- **No all-in / side pots** — a player who can't cover a bet must pack.
- **No room "leave before round starts" refund path** on the contract side —
  flagged in the earlier contract review, worth adding before this goes
  beyond a workshop demo.
- **Card back / felt texture images** were dropped from `assets/` since they
  were poker-specific; `PlayingCard.jsx` renders cards in pure CSS/text so
  nothing is broken, but drop new art into `src/assets/images/` if you want a
  more illustrated look.
