#!/usr/bin/env bash
# Rebuilds the contract and copies its ABI into the frontend.
# Run this after any change to src/TeenPattiGame.sol.
set -euo pipefail
cd "$(dirname "$0")/.."

forge build

python3 - <<'PY'
import json
abi = json.load(open("out/TeenPattiGame.sol/TeenPattiGame.json"))["abi"]
banner = (
    "// Dude this us auto generated from out/TeenPattiGame.sol/TeenPattiGame.json\n"
    "// Just run  ./scripts/sync-abi.sh  after changing the contract Dude\n"
)
with open("teenpatti-frontend/src/lib/abi.js", "w") as f:
    f.write(banner + "export const TEEN_PATTI_ABI = " + json.dumps(abi, indent=2) + ";\n")
print("ABI synced done ...")
PY
