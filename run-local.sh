#!/usr/bin/env bash

set -euo pipefail
cd "$(dirname "$0")"

ANVIL_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

echo "# starting anvil (local blockchain) on :8545"
anvil --silent &
sleep 2

echo "# deploying TeenPattiGame"
ADDRESS=$(forge create src/TeenPattiGame.sol:TeenPattiGame \
  --rpc-url http://127.0.0.1:8545 --private-key "$ANVIL_KEY" --broadcast \
  --json | python3 -c 'import json,sys; print(json.load(sys.stdin)["deployedTo"])')
echo "    deployed to $ADDRESS"

cat > teenpatti-frontend/.env <<ENV
VITE_CONTRACT_ADDRESS=$ADDRESS
VITE_SERVER_URL=http://localhost:4000
VITE_RPC_URL=http://127.0.0.1:8545
ENV

echo "# starting the game server on :4000"
(cd teenpatti-backend && \
  { [ -d .venv ] || python3 -m venv .venv; } && \
  .venv/bin/pip install -q -r requirements.txt && \
  .venv/bin/python -m uvicorn app.server:app --host 127.0.0.1 --port 4000) &

echo "# starting the frontend on :5173"
(cd teenpatti-frontend && { [ -d node_modules ] || npm install; } && npm run dev) &

sleep 4
cat <<INFO

  ---------------------------------------------------------------
   Ready. Open http://localhost:5173

   In MetaMask:
     1. Add a network:  RPC http://127.0.0.1:8545,  chain id 31337
     2. Import this test account (it has 10000 fake ETH):
        $ANVIL_KEY
     3. To play with 4 people, import 4 different Anvil accounts
        (anvil printed them all when it started) and open the game
        in 4 separate browser profiles or windows.
  ---------------------------------------------------------------

INFO

wait
