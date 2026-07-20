"""chain.py — optional: check that the transactions players claim they sent
actually exist on the blockchain.

WHY THIS EXISTS
    The browser is the one that talks to the wallet, so the browser is the one
    that tells this server "I paid, here's my transaction hash". A modified
    client could lie and claim a bet it never made. It could not steal the pot
    — only the contract can move ETH, and the contract only pays a real player
    — but it could bluff its way through a hand without paying.

    Turning this on closes that hole: before the server accepts a bet, it asks
    a real Ethereum node whether that transaction exists, succeeded, went to
    our contract, came from that player, and carried at least that much ETH.

TURNING IT ON (recommended for anything public)
    ETH_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
    CONTRACT_ADDRESS=0xYourDeployedTeenPattiGame

    With either unset, verification is skipped and the server simply trusts the
    client — which is completely fine for playing on localhost with friends,
    and keeps first-run setup to zero configuration.

Deliberately written with urllib from the standard library: no web3.py, no
extra dependency to install or keep up to date, ~60 lines you can read.
"""
import asyncio
import json
import os
import urllib.error
import urllib.request

from .engine import EngineError

RPC_URL = os.environ.get("ETH_RPC_URL", "").strip()
CONTRACT_ADDRESS = os.environ.get("CONTRACT_ADDRESS", "").strip().lower()
TIMEOUT_SECONDS = 8


def is_enabled():
    return bool(RPC_URL and CONTRACT_ADDRESS)


class ChainError(EngineError):
    """Raised when a claimed transaction doesn't hold up. It subclasses
    EngineError so server.py handles it like any other illegal move: the player
    who tried it gets an error, the game carries on."""


def _rpc(method, params):
    payload = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode()
    request = urllib.request.Request(RPC_URL, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        body = json.loads(response.read())
    if body.get("error"):
        raise ChainError(body["error"].get("message", "RPC error"))
    return body.get("result")


def _check(tx_hash, min_value_wei, sender):
    tx = _rpc("eth_getTransactionByHash", [tx_hash])
    if not tx:
        raise ChainError("That transaction is not on the blockchain")

    receipt = _rpc("eth_getTransactionReceipt", [tx_hash])
    if not receipt:
        raise ChainError("That transaction has not been mined yet")
    if int(receipt.get("status", "0x0"), 16) != 1:
        raise ChainError("That transaction failed on-chain")

    if (tx.get("to") or "").lower() != CONTRACT_ADDRESS:
        raise ChainError("That transaction was not sent to the game contract")
    if (tx.get("from") or "").lower() != sender.lower():
        raise ChainError("That transaction came from a different wallet")

    value = int(tx.get("value", "0x0"), 16)
    if min_value_wei is not None and value < int(min_value_wei):
        raise ChainError(f"That transaction only carried {value} wei, expected {min_value_wei}")
    return value


async def _verify(tx_hash, min_value_wei, sender):
    if not is_enabled() or not tx_hash:
        return None
    try:
        # urllib blocks, so keep it off the event loop — otherwise one slow RPC
        # node would freeze every other game on the server.
        return await asyncio.to_thread(_check, tx_hash, min_value_wei, sender)
    except ChainError:
        raise
    except (urllib.error.URLError, TimeoutError, ValueError) as e:
        # The node being unreachable must not make the game unplayable; log it
        # and fall back to trusting the client, exactly as if verification were
        # switched off.
        print(f"[chain] could not verify {tx_hash}: {e}")
        return None


async def verify_entry_fee(tx_hash, entry_fee_wei, sender):
    return await _verify(tx_hash, entry_fee_wei, sender)


async def verify_bet(tx_hash, amount_wei, sender):
    return await _verify(tx_hash, amount_wei, sender)
