# Teen Patti backend

Real-time game-state server for the Teen Patti frontend. This is the
`backend/src/server.js` that `socketService.js` already expects — just written
in Python instead of Node, and speaking the exact same Socket.IO event
contract, so **no frontend code needs to change**.

It owns only the off-chain game state (whose turn it is, what's in each
player's hand, pot/stake, etc). Wallet connections and real ETH transactions
still happen entirely in the browser via `walletService.js` talking straight
to your Anvil node / the `TeenPattiRoom` contract — this server never touches
a wallet or private key.

## What it does differently from the reference JS engine

- **Masks hole cards per player.** The original `teenPattiEngine.js` state
  object includes everyone's `cards` and just trusts the frontend not to
  render other players' hands. This server instead sends each socket its own
  personalized view — other players' cards come through as `null` until
  showdown. See `app/rooms.py::viewer_state`.
- **Adds `leave_seat`.** The reference engine never defined what happens when
  someone leaves — this server frees the seat if no hand is in progress, or
  treats it as a pack if one is (matches how packing already works, and
  avoids letting someone dodge a bet that's already escrowed on-chain).

Everything else — boot, blind/seen doubling, chaal, raise, pack, show,
hand ranking — is a straight line-for-line port of
`src/utils/teenPattiEngine.js` and `teenPattiEvaluator.js`. If you change the
rules on one side, change them on the other.

## Project layout

```
backend/
  app/
    server.py     # Socket.IO event handlers (the entry point)
    engine.py      # game rules — port of teenPattiEngine.js
    evaluator.py   # hand ranking — port of teenPattiEvaluator.js
    deck.py        # port of deck.js
    rooms.py       # in-memory room store + per-player card masking
  requirements.txt
  Procfile         # for Render/Railway
  render.yaml      # one-click Render blueprint
  .env.example
  smoke_test.py    # scripted 2-player round, run it after any engine change
```

## Run it locally

Requires Python 3.10+.

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

uvicorn app.server:app --reload --port 4000
```

The server is now listening on `http://localhost:4000` with Socket.IO mounted
at the default path (`/socket.io/`), which is exactly what
`socketService.js` connects to out of the box.

In the frontend's `.env`:

```
VITE_SOCKET_URL=http://localhost:4000
```

Then, in a separate terminal, run the frontend as usual (`npm run dev`) and
Anvil (`anvil`) as usual — nothing else changes.

**Sanity check:** with the server running, `python3 smoke_test.py` plays a
full two-player round over a real socket connection and asserts the state
comes back correctly (including that each player can't see the other's
cards). Useful after touching `engine.py`.

## Deploy it online for free

Any host that runs a long-lived Python process works — this isn't tied to
one provider. Two easy free options:

### Option A — Render (recommended, has a `render.yaml` already)

1. Push this `backend/` folder to a GitHub repo (or your existing repo, backend
   in a subfolder is fine).
2. On [render.com](https://render.com), **New → Blueprint**, point it at the
   repo. It'll read `render.yaml` and set everything up on the free tier.
3. Once deployed, Render gives you a URL like
   `https://teenpatti-backend.onrender.com`.
4. In the frontend's `.env` (or your frontend host's env config):
   ```
   VITE_SOCKET_URL=https://teenpatti-backend.onrender.com
   ```
5. Tighten CORS: in the Render dashboard, set `CORS_ORIGINS` to your deployed
   frontend's actual URL instead of `*` once you know it.

Free-tier caveat: Render's free web services spin down after 15 minutes of
no traffic and take ~30-60s to wake back up on the next request — fine for a
demo/friends game, not for a always-on production table.

### Option B — Railway / Fly.io

Same idea, no code changes needed:
- **Railway**: New Project → Deploy from GitHub → it auto-detects the
  `Procfile`. Set `CORS_ORIGINS` in the Variables tab.
- **Fly.io**: `fly launch` in this folder, accept the Python/Procfile
  detection, `fly deploy`. Set `CORS_ORIGINS` with `fly secrets set`.

Whichever you pick, the only thing that changes on the frontend is
`VITE_SOCKET_URL`.

## Environment variables

| Variable       | Default | Meaning                                                                 |
|----------------|---------|--------------------------------------------------------------------------|
| `CORS_ORIGINS` | `*`     | Comma-separated allowed origins, e.g. `https://myapp.vercel.app`. Use `*` for local dev/quick demos only. |
| `PORT`         | `4000`  | Most hosts inject this for you; only matters if you set it yourself.   |

## Known limitations (carried over from the frontend, not new)

- **Refreshing the Room page loses your `playerId`.** `RoomContext`'s
  `rejoinFromUrl` restores the room state but not who *you* are in it — that
  identity currently only lives in React state, which resets on reload. If
  you want reload-proof sessions, the cleanest fix is to have the frontend
  stash `{roomCode, playerId}` in `sessionStorage` on create/join and read it
  back in `rejoinFromUrl` (real browser `sessionStorage` is fine in the
  actual Vite app — this restriction only applies inside Claude.ai's
  in-chat Artifacts sandbox). Happy to wire that up if you want it.
- **No reconnect-to-your-seat-with-cards-visible on refresh** follows
  directly from the point above, for the same reason.
- **Single process, in-memory rooms.** Fine for one server instance; if you
  ever scale to multiple instances you'd need to move `ROOMS` in
  `app/rooms.py` to something shared like Redis.
