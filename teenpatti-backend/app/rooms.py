# stores active game room in memory and manages their room code and life-cycle and determines what each player are allowed to see

import copy
import random
import time

ROOMS = {}  
CREATED_AT = {}  

ROOM_TTL_SECONDS = 6 * 60 * 60

CODE_ALPHABET = "3456789ABCDEFGHJKLMNPQRSTUVWXYZ"
CODE_LENGTH = 5


def generate_room_code():
    while True:
        code = "".join(random.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        if code not in ROOMS:
            return code


def normalize_code(code):
    return (code or "").strip().upper()


def get_room(code):
    return ROOMS.get(normalize_code(code))


def save_room(code, state):
    code = normalize_code(code)
    ROOMS[code] = state
    CREATED_AT.setdefault(code, time.time())


def delete_room(code):
    code = normalize_code(code)
    ROOMS.pop(code, None)
    CREATED_AT.pop(code, None)


def sweep_expired():
    cutoff = time.time() - ROOM_TTL_SECONDS
    for code in [c for c, t in CREATED_AT.items() if t < cutoff]:
        delete_room(code)


def _stringify_wei(value):
    if isinstance(value, dict):
        return {k: (str(v) if k.endswith("Wei") and isinstance(v, int) else _stringify_wei(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [_stringify_wei(v) for v in value]
    return value


def viewer_state(state, viewer_player_id):
    out = copy.deepcopy(state)
    out.pop("deck", None)

    revealed = out["phase"] == "finished" and out.get("winners") is not None

    for seat in out["seats"]:
        if not seat or not seat.get("cards"):
            continue
        is_me = seat["playerId"] == viewer_player_id
        if not (is_me or (revealed and not seat["packed"])):
            seat["cards"] = [None, None, None]

    out["you"] = viewer_player_id
    return _stringify_wei(out)


def public_summary(state):
    seated = [s for s in state["seats"] if s]
    return {
        "roomCode": state["roomCode"],
        "gameId": state["gameId"],
        "entryFeeWei": str(state["entryFeeWei"]),
        "playerCount": len(seated),
        "maxSeats": state["maxSeats"],
        "phase": state["phase"],
        "hostName": next((s["name"] for s in seated if s["isHost"]), None),
        "players": [s["name"] for s in seated],
    }
