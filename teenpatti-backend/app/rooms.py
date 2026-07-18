"""rooms.py — in-memory room registry + the per-viewer "what should this
socket actually see" logic.

Storage is a plain dict in process memory. That's fine for a single-process
demo/small-table deployment (matches the trust model of the contract, which
already trusts a single host address per room). If you outgrow one process,
swap ROOMS for Redis and keep the function signatures the same.
"""
import copy
import random
import string
import time

ROOMS = {}  # roomCode -> engine state dict
ROOM_LAST_TOUCHED = {}  # roomCode -> unix timestamp, for the optional reaper


def _random_code(length=6):
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choice(alphabet) for _ in range(length))


def generate_room_code():
    while True:
        code = _random_code()
        if code not in ROOMS:
            return code


def touch(room_code):
    ROOM_LAST_TOUCHED[room_code] = time.time()


def get_room(room_code):
    return ROOMS.get(room_code)


def save_room(room_code, state):
    ROOMS[room_code] = state
    touch(room_code)


def delete_room(room_code):
    ROOMS.pop(room_code, None)
    ROOM_LAST_TOUCHED.pop(room_code, None)


def viewer_state(state, viewer_player_id):
    """Returns a copy of `state` safe to send to one specific player.

    - Strips the undealt `deck` — no reason a client ever needs it, and
      sending it would leak the order of upcoming cards.
    - Masks every OTHER seated player's hole cards unless the hand is over
      (`roundComplete`) and that player didn't pack. This is the one thing
      the reference JS engine leaves to "the frontend won't render it" — a
      real multi-process server shouldn't rely on client-side honesty for
      that, so it's enforced here instead.
    """
    out = copy.deepcopy(state)
    out.pop("deck", None)

    reveal_all = out["phase"] == "roundComplete" and out.get("winners") is not None

    for seat in out["seats"]:
        if not seat or not seat.get("cards"):
            continue
        is_viewer = seat["playerId"] == viewer_player_id
        show = is_viewer or (reveal_all and not seat["packed"])
        if not show:
            seat["cards"] = [None, None, None]

    return out
