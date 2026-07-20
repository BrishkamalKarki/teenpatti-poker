# Frontend

React + Vite. Talks to a wallet through `ethers`, and to the game server
through `socket.io-client`.

```bash
npm install
cp .env.example .env      # fill in VITE_CONTRACT_ADDRESS
npm run dev               # http://localhost:5173
npm test                  # render tests
npm run build
```

## The two files that matter

- **`src/lib/contract.js`** — the only file that knows about wallets or the
  contract. Every on-chain action in the game is one function in here.
- **`src/lib/socket.js`** — the only file that knows about the server. The
  event names match `teenpatti-backend/app/server.py`'s docstring.

Everything else is presentation.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `VITE_CONTRACT_ADDRESS` | Where TeenPattiGame.sol is deployed. Must match your wallet's network. |
| `VITE_SERVER_URL` | The game server. Defaults to `http://localhost:4000`. |
| `VITE_RPC_URL` | Optional read-only RPC, so the Blockchain panel works before connecting a wallet. |

Vite bakes these in at build time — after changing them on Vercel you must
redeploy, not just restart.

## Deploying to Vercel

Root Directory `teenpatti-frontend`. `vercel.json` sets the build and the SPA
rewrite (without it, refreshing on `/room/7K9XM` would 404).

## Styling

Two stylesheets do the layout work:

- `src/styles/theme.css` — every colour, size, radius and spacing step. Nothing
  else in the app invents its own, which is what keeps components aligned.
- `src/styles/global.css` — buttons, panels, fields, badges, modal. Defined
  once so every button is the same height and every panel lines up.

The table (`src/styles/room.css`) places seats in named cells of a CSS grid
rather than at percentage positions around an ellipse. A grid cell cannot
overlap its neighbour or hang off the edge of the felt, at any window size,
with any number of players, however long a name is.
