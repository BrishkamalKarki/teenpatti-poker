# Frontend

## Files

**Root**
- `index.html` — HTML entry point
- `package.json` — deps and scripts
- `vite.config.js` — Vite dev server / build config
- `vercel.json` — Vercel build + SPA routing rewrite
- `.env.example` — sample env file

**src/**
- `main.jsx` — app entry, wraps App with providers
- `App.jsx` — routes (`Lobby`, `Room`)
- `ui.test.jsx` — smoke tests that render the pages

**src/pages/**
- `Lobby.jsx` — create or join a room
- `Room.jsx` — the live game table screen

**src/components/**
- `Card.jsx` — a single playing card
- `Toasts.jsx` — toast/error notifications
- `Wallet.jsx` — wallet connect state + button
- `ui.jsx` — shared Button, Panel, Modal, Badge, CopyText

**src/components/room/**
- `Table.jsx` — felt, pot, and seats
- `ActionBar.jsx` — See / Pack / Chaal / Raise / Show buttons
- `Sidebar.jsx` — players, log, room info
- `BlockchainPanel.jsx` — contract vs server state side by side
- `GameOver.jsx` — end screen + payout

**src/lib/**
- `contract.js` — all wallet/contract calls
- `socket.js` — all server communication
- `abi.js` — auto-generated contract ABI
- `format.js` — wei ↔ ETH formatting
- `session.js` — remembers your seat across refresh

**src/styles/**
- `theme.css` — colors, spacing, sizes
- `global.css` — buttons, panels, inputs, modal
- `room.css` — table/seat layout
- `lobby.css` — lobby page layout

**public/cards/** — card face SVGs

## .env

```
VITE_CONTRACT_ADDRESS=  # deployed TeenPattiGame.sol address
VITE_SERVER_URL=     # game server (default http://localhost:4000)
VITE_RPC_URL=     # optional read-only RPC
```