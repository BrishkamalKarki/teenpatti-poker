"""server.py — the real-time backend for the Teen Patti frontend.

Implements exactly the event contract documented at the top of
src/services/socketService.js on the frontend:

    room:create    ({ hostName, maxSeats, buyIn, roomCode? })  -> ack { roomCode, playerId, state }
    room:join      ({ roomCode, playerName, buyIn })           -> ack { playerId, state }
    room:leave     ({ roomCode, playerId })                    -> no ack
    room:startHand ({ roomCode })                               -> ack { state }
    room:action    ({ roomCode, playerId, type, amount })      -> ack { state }
    room:subscribe ({ roomCode })                               -> no ack, pushes 'room:state'
    'room:state'   pushed to every subscriber whenever a room changes

Ack shape on failure: { ok: false, error: "message" } — matches what
socketService.js's emitWithAck() expects to reject the promise on.

Run locally:
    uvicorn app.server:app --reload --port 4000

Deploy free online: see backend/README.md (Render/Railway/Fly all work with
this exact file — no code changes needed, only environment variables).
"""
import os
import uuid

import socketio
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route

from . import engine, rooms

# --- CORS --------------------------------------------------------------
# Set CORS_ORIGINS to a comma-separated list of frontend origins in
# production (e.g. "https://your-app.vercel.app,http://localhost:5173").
# Left as "*" this accepts any origin, which is fine for local dev / a
# quick public demo but you should lock it down before sharing widely.
_raw_origins = os.environ.get("CORS_ORIGINS", "*")
CORS_ORIGINS = "*" if _raw_origins.strip() == "*" else [o.strip() for o in _raw_origins.split(",") if o.strip()]

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=CORS_ORIGINS)

# sid -> set of roomCodes that socket is subscribed to
SID_ROOMS = {}
# roomCode -> set of sids subscribed to it
SUBSCRIBERS = {}
# (sid, roomCode) -> playerId, so we know whose hole cards a given socket may see
SID_PLAYER = {}


def _new_player_id():
    return "p_" + uuid.uuid4().hex[:12]


def _subscribe(sid, room_code, player_id=None):
    SUBSCRIBERS.setdefault(room_code, set()).add(sid)
    SID_ROOMS.setdefault(sid, set()).add(room_code)
    if player_id:
        SID_PLAYER[(sid, room_code)] = player_id


def _unsubscribe(sid, room_code):
    SUBSCRIBERS.get(room_code, set()).discard(sid)
    SID_ROOMS.get(sid, set()).discard(room_code)
    SID_PLAYER.pop((sid, room_code), None)


async def _broadcast(room_code, exclude=None):
    exclude = exclude or set()
    state = rooms.get_room(room_code)
    if not state:
        return
    for sid in list(SUBSCRIBERS.get(room_code, set())):
        if sid in exclude:
            continue
        player_id = SID_PLAYER.get((sid, room_code))
        await sio.emit("room:state", rooms.viewer_state(state, player_id), room=sid)


# --- connection lifecycle ------------------------------------------------

@sio.event
async def connect(sid, environ, auth):
    return True


@sio.event
async def disconnect(sid):
    for room_code in list(SID_ROOMS.get(sid, set())):
        _unsubscribe(sid, room_code)
    SID_ROOMS.pop(sid, None)


# --- room lifecycle events -------------------------------------------------

@sio.on("room:create")
async def room_create(sid, data):
    data = data or {}
    try:
        host_name = (data.get("hostName") or "").strip() or "Host"
        max_seats = int(data.get("maxSeats") or 6)
        boot_amount = data.get("buyIn")
        boot_amount = 1000 if boot_amount is None else boot_amount

        desired_code = data.get("roomCode")
        room_code = str(desired_code) if desired_code not in (None, "") else rooms.generate_room_code()
        if rooms.get_room(room_code) is not None:
            # Someone already holds that code (e.g. stale room from a prior
            # server run reusing an on-chain roomId) — don't clobber it.
            room_code = rooms.generate_room_code()

        state = engine.create_room_state(room_code, max_seats, boot_amount)
        player_id = _new_player_id()
        engine.seat_player(state, player_id, host_name, boot_amount, is_host=True)
        rooms.save_room(room_code, state)
        _subscribe(sid, room_code, player_id)

        return {"roomCode": room_code, "playerId": player_id, "state": rooms.viewer_state(state, player_id)}
    except engine.EngineError as e:
        return {"ok": False, "error": str(e)}
    except Exception:
        return {"ok": False, "error": "Could not create room"}


@sio.on("room:join")
async def room_join(sid, data):
    data = data or {}
    room_code = data.get("roomCode")
    state = rooms.get_room(room_code)
    if not state:
        return {"ok": False, "error": "Room not found"}

    try:
        player_name = (data.get("playerName") or "").strip() or "Player"
        buy_in = data.get("buyIn")
        buy_in = state["bootAmount"] if buy_in is None else buy_in

        player_id = _new_player_id()
        engine.seat_player(state, player_id, player_name, buy_in, is_host=False)
        rooms.save_room(room_code, state)
        _subscribe(sid, room_code, player_id)
        await _broadcast(room_code, exclude={sid})

        return {"playerId": player_id, "state": rooms.viewer_state(state, player_id)}
    except engine.EngineError as e:
        return {"ok": False, "error": str(e)}


@sio.on("room:leave")
async def room_leave(sid, data):
    data = data or {}
    room_code = data.get("roomCode")
    player_id = data.get("playerId")
    state = rooms.get_room(room_code)
    if state and player_id:
        engine.leave_seat(state, player_id)
        rooms.save_room(room_code, state)
        await _broadcast(room_code)
    _unsubscribe(sid, room_code)
    # No ack: socketService.leaveRoom() fires this without a callback.


@sio.on("room:startHand")
async def room_start_hand(sid, data):
    data = data or {}
    room_code = data.get("roomCode")
    state = rooms.get_room(room_code)
    if not state:
        return {"ok": False, "error": "Room not found"}

    try:
        engine.start_round(state)
        rooms.save_room(room_code, state)
        await _broadcast(room_code)
        player_id = SID_PLAYER.get((sid, room_code))
        return {"state": rooms.viewer_state(state, player_id)}
    except engine.EngineError as e:
        return {"ok": False, "error": str(e)}


@sio.on("room:action")
async def room_action(sid, data):
    data = data or {}
    room_code = data.get("roomCode")
    player_id = data.get("playerId")
    action_type = data.get("type")
    amount = data.get("amount")

    state = rooms.get_room(room_code)
    if not state:
        return {"ok": False, "error": "Room not found"}

    try:
        engine.apply_action(state, player_id, action_type, amount)
        rooms.save_room(room_code, state)
        await _broadcast(room_code)
        return {"state": rooms.viewer_state(state, player_id)}
    except engine.EngineError as e:
        return {"ok": False, "error": str(e)}


@sio.on("room:subscribe")
async def room_subscribe(sid, data):
    data = data or {}
    room_code = data.get("roomCode")
    if not room_code:
        return
    # Frontend doesn't send playerId on subscribe today, but accept it if a
    # future client (or a page-refresh reconnect) does, so it can still see
    # its own cards instead of being treated as a spectator.
    player_id = data.get("playerId") or SID_PLAYER.get((sid, room_code))
    _subscribe(sid, room_code, player_id)

    state = rooms.get_room(room_code)
    if state:
        await sio.emit("room:state", rooms.viewer_state(state, player_id), room=sid)
    # No ack: socketService.subscribe() / getRoomState() listen for the
    # 'room:state' push above instead of a callback.


# --- health check / ASGI app -----------------------------------------------

async def health(request):
    return JSONResponse({"ok": True, "rooms": len(rooms.ROOMS)})


starlette_app = Starlette(routes=[Route("/", health), Route("/healthz", health)])

# Mount Socket.IO on top of a tiny Starlette app so free hosts (Render,
# Railway, Fly) have something to hit for their health check, and so you get
# a friendly response instead of a 404 if you open the URL in a browser.
app = socketio.ASGIApp(sio, other_asgi_app=starlette_app, socketio_path="socket.io")
