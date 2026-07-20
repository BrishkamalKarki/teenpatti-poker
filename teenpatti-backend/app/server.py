# real-time game server that talks with the socket.js to keep both in sync, this manages the game and the game state 
# end-point for the deployment  

import os

import socketio
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route

from . import chain, engine, rooms

_origins = os.environ.get("CORS_ORIGINS", "*").strip()
CORS_ORIGINS = "*" if _origins == "*" else [o.strip() for o in _origins.split(",") if o.strip()]

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=CORS_ORIGINS)

SUBSCRIBERS = {} 
SID_ROOMS = {}  
SID_PLAYER = {}



def _address_id(value):
    """A player's id IS their wallet address, lowercased. That is the whole
    trick that keeps the game and the chain talking about the same person:
    when the hand ends, the winner's id can be handed straight to
    finishGame(gameId, winners) with no lookup table in between."""
    if isinstance(value, str) and value.startswith("0x") and len(value) == 42:
        return value.lower()
    raise ValueError("A connected wallet is required to play")


def _subscribe(sid, room_code, player_id=None):
    SUBSCRIBERS.setdefault(room_code, set()).add(sid)
    SID_ROOMS.setdefault(sid, set()).add(room_code)
    if player_id:
        SID_PLAYER[(sid, room_code)] = player_id


def _unsubscribe(sid, room_code):
    SUBSCRIBERS.get(room_code, set()).discard(sid)
    SID_ROOMS.get(sid, set()).discard(room_code)
    SID_PLAYER.pop((sid, room_code), None)


async def _broadcast(room_code):
    """Pushes the room to everyone watching it — each player gets their own
    view, because each player is allowed to see different cards."""
    state = rooms.get_room(room_code)
    if not state:
        return
    for sid in list(SUBSCRIBERS.get(room_code, set())):
        view = rooms.viewer_state(state, SID_PLAYER.get((sid, room_code)))
        await sio.emit("room:state", view, room=sid)


def _host_seat(state):
    return next((s for s in state["seats"] if s and s["isHost"]), None)


def _require_host(state, player_id):
    host = _host_seat(state)
    if not host or host["playerId"] != player_id:
        raise engine.EngineError("Only the host can do that")


def _ok(state, player_id):
    return {"state": rooms.viewer_state(state, player_id)}


def _fail(message):
    return {"ok": False, "error": str(message)}


@sio.event
async def connect(sid, environ, auth):
    return True


@sio.event
async def disconnect(sid):
    """A dropped socket does NOT pack you — phones sleep and wifi drops, and
    your ETH is already in the pot. You keep your seat and can rejoin with the
    same wallet; the host has a kick button if someone truly never comes back."""
    for room_code in list(SID_ROOMS.get(sid, set())):
        _unsubscribe(sid, room_code)
    SID_ROOMS.pop(sid, None)


@sio.on("room:create")
async def room_create(sid, data):
    data = data or {}
    try:
        rooms.sweep_expired()

        room_code = rooms.normalize_code(data.get("roomCode"))
        if len(room_code) != rooms.CODE_LENGTH:
            return _fail("Bad room code")
        if rooms.get_room(room_code):
            return _fail("That room code is taken, try again")

        game_id = data.get("gameId")
        if game_id is None:
            return _fail("Create the room on-chain first")

        entry_fee_wei = int(data.get("entryFeeWei"))
        max_seats = int(data.get("maxSeats") or 4)
        if not 2 <= max_seats <= 4:
            return _fail("A table seats between 2 and 4 players")

        host_id = _address_id(data.get("address"))
        host_name = (data.get("hostName") or "").strip()[:20] or "Host"
        tx_hash = data.get("txHash")

        await chain.verify_entry_fee(tx_hash, entry_fee_wei, host_id)

        state = engine.create_room_state(room_code, int(game_id), entry_fee_wei, max_seats)
        engine.seat_player(state, host_id, host_name, is_host=True)
        engine.add_tx(state, kind="create", tx_hash=tx_hash, address=host_id,
                      name=host_name, amount_wei=entry_fee_wei)

        rooms.save_room(room_code, state)
        _subscribe(sid, room_code, host_id)
        return {"roomCode": room_code, "playerId": host_id, **_ok(state, host_id)}
    except (engine.EngineError, ValueError) as e:
        return _fail(e)


@sio.on("room:lookup")
async def room_lookup(sid, data):
    """Read-only: what a room costs and whether it has space. No seat is taken
    and no wallet is needed — the Join form calls this before asking anyone to
    pay anything."""
    state = rooms.get_room((data or {}).get("roomCode"))
    if not state:
        return _fail("No room with that code")
    return rooms.public_summary(state)


@sio.on("room:join")
async def room_join(sid, data):
    data = data or {}
    state = rooms.get_room(data.get("roomCode"))
    if not state:
        return _fail("No room with that code")

    try:
        player_id = _address_id(data.get("address"))
        name = (data.get("playerName") or "").strip()[:20] or "Player"
        tx_hash = data.get("txHash")

        await chain.verify_entry_fee(tx_hash, state["entryFeeWei"], player_id)

        engine.seat_player(state, player_id, name)
        engine.add_tx(state, kind="join", tx_hash=tx_hash, address=player_id,
                      name=name, amount_wei=state["entryFeeWei"])

        rooms.save_room(state["roomCode"], state)
        _subscribe(sid, state["roomCode"], player_id)
        await _broadcast(state["roomCode"])
        return {"playerId": player_id, **_ok(state, player_id)}
    except (engine.EngineError, ValueError) as e:
        return _fail(e)


@sio.on("room:start")
async def room_start(sid, data):
    data = data or {}
    state = rooms.get_room(data.get("roomCode"))
    if not state:
        return _fail("No room with that code")

    try:
        player_id = data.get("playerId")
        _require_host(state, player_id)
        engine.start_game(state)
        engine.add_tx(state, kind="start", tx_hash=data.get("txHash"), address=player_id,
                      name=_host_seat(state)["name"])
        rooms.save_room(state["roomCode"], state)
        await _broadcast(state["roomCode"])
        return _ok(state, player_id)
    except engine.EngineError as e:
        return _fail(e)


@sio.on("room:action")
async def room_action(sid, data):
    """One move. 'see' and 'pack' are free and instant. 'bet' and 'show' arrive
    only after the player's bet() transaction has confirmed, and carry the wei
    they actually sent — the engine checks that against what they owe."""
    data = data or {}
    state = rooms.get_room(data.get("roomCode"))
    if not state:
        return _fail("No room with that code")

    try:
        player_id = data.get("playerId")
        action = data.get("action")
        amount_wei = int(data["amountWei"]) if data.get("amountWei") is not None else None
        tx_hash = data.get("txHash")

        if action in ("bet", "show"):
            if not tx_hash:
                raise engine.EngineError("That bet has no transaction — send the ETH first")
            await chain.verify_bet(tx_hash, amount_wei, player_id)

        seat_index = engine.find_seat_index(state, player_id)
        name = state["seats"][seat_index]["name"] if seat_index != -1 else "?"

        engine.apply_action(state, player_id, action, amount_wei)

        if action in ("bet", "show"):
            engine.add_tx(state, kind=action, tx_hash=tx_hash, address=player_id,
                          name=name, amount_wei=amount_wei)

        rooms.save_room(state["roomCode"], state)
        await _broadcast(state["roomCode"])
        return _ok(state, player_id)
    except (engine.EngineError, ValueError) as e:
        return _fail(e)


@sio.on("room:finish")
async def room_finish(sid, data):
    """Host confirms the pot has been paid out on-chain. The room is over."""
    data = data or {}
    state = rooms.get_room(data.get("roomCode"))
    if not state:
        return _fail("No room with that code")

    try:
        player_id = data.get("playerId")
        _require_host(state, player_id)
        tx_hash = data.get("txHash")

        engine.mark_paid(state, tx_hash)
        engine.add_tx(state, kind="payout", tx_hash=tx_hash, address=state["winners"][0]["playerId"],
                      name=", ".join(w["name"] for w in state["winners"]),
                      amount_wei=sum(int(w["amountWei"]) for w in state["winners"]))

        rooms.save_room(state["roomCode"], state)
        await _broadcast(state["roomCode"])
        return _ok(state, player_id)
    except engine.EngineError as e:
        return _fail(e)


@sio.on("room:kick")
async def room_kick(sid, data):
    """Host's escape hatch for a player who walked away mid-hand: it packs
    them, so the hand can finish. It cannot take their money — their ETH stays
    in the pot exactly as if they had folded, which is what packing means."""
    data = data or {}
    state = rooms.get_room(data.get("roomCode"))
    if not state:
        return _fail("No room with that code")

    try:
        player_id = data.get("playerId")
        _require_host(state, player_id)
        target = (data.get("targetId") or "").lower()
        if target == player_id:
            raise engine.EngineError("You cannot pack yourself this way — use Pack on your turn")
        engine.leave_seat(state, target)
        rooms.save_room(state["roomCode"], state)
        await _broadcast(state["roomCode"])
        return _ok(state, player_id)
    except engine.EngineError as e:
        return _fail(e)


@sio.on("room:leave")
async def room_leave(sid, data):
    data = data or {}
    state = rooms.get_room(data.get("roomCode"))
    player_id = data.get("playerId")
    if state and player_id:
        engine.leave_seat(state, player_id)
        rooms.save_room(state["roomCode"], state)
        await _broadcast(state["roomCode"])
        if not any(state["seats"]):
            rooms.delete_room(state["roomCode"])
    _unsubscribe(sid, rooms.normalize_code(data.get("roomCode")))


@sio.on("room:subscribe")
async def room_subscribe(sid, data):
    """Called on page load — including after a refresh, where the browser
    remembers which wallet it was playing as and passes it back so you get your
    own cards again instead of being treated as a spectator."""
    data = data or {}
    room_code = rooms.normalize_code(data.get("roomCode"))
    if not room_code:
        return
    player_id = (data.get("playerId") or "").lower() or SID_PLAYER.get((sid, room_code))
    _subscribe(sid, room_code, player_id)

    state = rooms.get_room(room_code)
    if state:
        await sio.emit("room:state", rooms.viewer_state(state, player_id), room=sid)
    else:
        await sio.emit("room:gone", {"roomCode": room_code}, room=sid)


async def health(request):
    return JSONResponse({
        "ok": True,
        "rooms": len(rooms.ROOMS),
        "verifyingOnChain": chain.is_enabled(),
    })


starlette_app = Starlette(routes=[Route("/", health), Route("/healthz", health)])

app = socketio.ASGIApp(sio, other_asgi_app=starlette_app, socketio_path="socket.io")
