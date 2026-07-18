"""engine.py — port of the frontend's src/utils/teenPattiEngine.js.

Takes a room `state` dict and returns a (possibly mutated) state dict. This is
the SERVER's copy and is the source of truth — the frontend keeps its own copy
of the original JS file purely for optimistic/local preview. Gameplay rules
must stay identical on both sides, so if you change betting/showdown logic
here, mirror it in teenPattiEngine.js too (and vice versa).

Seat shape: { playerId, name, chips, isHost, packed, seen, cards }
Room phase: 'waiting' -> 'playing' -> 'roundComplete' -> 'playing' -> ...

Nepali Teen Patti rules encoded here:
  - Boot (ante): every seated player pays `bootAmount` into the pot before cards are dealt.
  - Blind vs Seen: a player who hasn't looked at their cards ("blind") owes `stake`
    per bet; once they look ("seen"), they owe `2 * stake`. Classic Nepali/Indian
    home-game convention — seeing your cards costs double.
  - Chaal: calling the current stake. Raising updates `stake` for the table.
  - Pack: folding. If only one player remains, they win the pot uncontested.
  - Show: once exactly 2 players remain, either can call a show by paying the
    current stake; hands are compared and the pot is awarded (split on an exact tie).

Simplifications vs. real-table Teen Patti (documented on purpose, not bugs):
  - No side-show (privately comparing cards with the previous bettor mid-round).
  - No all-in / side pots — a bet must be fully covered by the player's chips,
    otherwise they must pack. Skipped to keep on-chain settlement simple for v1.

Addition not present in the original JS file: `leave_seat`. The reference
engine never needed it because the frontend never called an "unseat" function —
but a real server has to do *something* when a browser tab disconnects or a
player explicitly leaves. See its docstring below for the rule used.
"""
from .deck import build_deck, shuffle
from .evaluator import evaluate_three, compare_scores, score_label


class EngineError(Exception):
    pass


def create_room_state(room_code, max_seats, boot_amount):
    return {
        "roomCode": room_code,
        "maxSeats": max_seats,
        "bootAmount": boot_amount,
        "seats": [None] * max_seats,
        "deck": [],
        "pot": 0,
        "stake": boot_amount,
        "phase": "waiting",  # 'waiting' | 'playing' | 'roundComplete'
        "dealerIndex": -1,
        "currentTurnIndex": -1,
        "winners": None,
    }


def _occupied_indices(seats):
    return [i for i, s in enumerate(seats) if s]


def _next_occupied_index(seats, from_index):
    occ = _occupied_indices(seats)
    if not occ:
        return -1
    n = len(seats)
    start = (from_index + 1) % n
    for i in range(n):
        idx = (start + i) % n
        if seats[idx]:
            return idx
    return occ[0]


def _active_indices(seats):
    return [i for i, s in enumerate(seats) if s and not s["packed"]]


def _next_active_index(seats, from_index):
    n = len(seats)
    start = (from_index + 1) % n
    for i in range(n):
        idx = (start + i) % n
        s = seats[idx]
        if s and not s["packed"]:
            return idx
    return -1


def seat_player(state, player_id, name, chips, is_host=False):
    """Seats a player in the first open chair. Mutates and returns state."""
    try:
        seat_index = state["seats"].index(None)
    except ValueError:
        raise EngineError("Room is full")
    state["seats"][seat_index] = {
        "playerId": player_id,
        "name": name,
        "chips": chips,
        "isHost": is_host,
        "packed": False,
        "seen": False,
        "cards": [],
    }
    return state


def leave_seat(state, player_id):
    """Not in the original JS engine — added so `room:leave` has something to do.

    Rule: you can only vacate a seat (freeing it up for someone else) when no
    chips are at risk — i.e. phase is 'waiting' or 'roundComplete'. If a hand
    is in progress ('playing'), leaving is treated as packing instead, same as
    if you'd clicked Pack — your boot/bets stay in the pot and the hand
    continues normally for everyone else.
    """
    seat_index = next((i for i, s in enumerate(state["seats"]) if s and s["playerId"] == player_id), -1)
    if seat_index == -1:
        return state

    if state["phase"] == "playing":
        return apply_action(state, player_id, "pack", None)

    state["seats"][seat_index] = None
    return state


def start_round(state):
    occ = _occupied_indices(state["seats"])
    if len(occ) < 2:
        raise EngineError("Need at least 2 players to start a round")

    deck = shuffle(build_deck())
    pot = 0
    for s in state["seats"]:
        if not s:
            continue
        if s["chips"] < state["bootAmount"]:
            raise EngineError(f"{s['name']} does not have enough chips for the boot")
        pot += state["bootAmount"]
        s["packed"] = False
        s["seen"] = False
        s["cards"] = [deck.pop(), deck.pop(), deck.pop()]
        s["chips"] -= state["bootAmount"]

    dealer_index = _next_occupied_index(state["seats"], state.get("dealerIndex", -1))
    first_to_act = _next_occupied_index(state["seats"], dealer_index)

    state["deck"] = deck
    state["pot"] = pot
    state["phase"] = "playing"
    state["dealerIndex"] = dealer_index
    state["currentTurnIndex"] = first_to_act
    state["stake"] = state["bootAmount"]
    state["winners"] = None
    return state


def _award_pot_to_last_standing(state):
    (only_index,) = _active_indices(state["seats"])
    winner_seat = state["seats"][only_index]
    winner_seat["chips"] += state["pot"]
    state["winners"] = [{
        "playerId": winner_seat["playerId"],
        "name": winner_seat["name"],
        "label": "Won — everyone else packed",
        "amount": state["pot"],
    }]
    state["phase"] = "roundComplete"
    state["pot"] = 0
    state["currentTurnIndex"] = -1
    return state


def _resolve_show(state, seat_index_a, seat_index_b):
    a = state["seats"][seat_index_a]
    b = state["seats"][seat_index_b]
    score_a = evaluate_three(a["cards"])
    score_b = evaluate_three(b["cards"])
    cmp = compare_scores(score_a, score_b)

    if cmp == 0:
        share = state["pot"] // 2
        remainder = state["pot"] - share * 2
        a["chips"] += share + remainder
        b["chips"] += share
        state["winners"] = [
            {"playerId": a["playerId"], "name": a["name"], "label": f"{score_label(score_a)} (Pot split)", "amount": share + remainder},
            {"playerId": b["playerId"], "name": b["name"], "label": f"{score_label(score_b)} (Pot split)", "amount": share},
        ]
    else:
        winner_index = seat_index_a if cmp > 0 else seat_index_b
        winner_score = score_a if cmp > 0 else score_b
        winner_seat = state["seats"][winner_index]
        winner_seat["chips"] += state["pot"]
        state["winners"] = [{"playerId": winner_seat["playerId"], "name": winner_seat["name"], "label": score_label(winner_score), "amount": state["pot"]}]

    state["phase"] = "roundComplete"
    state["pot"] = 0
    state["currentTurnIndex"] = -1
    return state


def apply_action(state, player_id, type_, amount):
    """Applies one player action. Mutates and returns state.

    type: 'seeCards' | 'pack' | 'bet' | 'show'
    amount: for 'bet'/'show', the TOTAL chips wagered this action (must be >= the
            required minimum for the player's blind/seen status). None to call the minimum.
    """
    if state["phase"] != "playing":
        raise EngineError("No active round")
    seat_index = next((i for i, s in enumerate(state["seats"]) if s and s["playerId"] == player_id), -1)
    if seat_index == -1:
        raise EngineError("Player not seated")

    if type_ == "seeCards":
        if seat_index != state["currentTurnIndex"]:
            raise EngineError("Not your turn")
        state["seats"][seat_index]["seen"] = True
        return state  # seeing your cards doesn't pass the turn

    if seat_index != state["currentTurnIndex"]:
        raise EngineError("Not your turn")
    seat = state["seats"][seat_index]

    if type_ == "pack":
        seat["packed"] = True
        if len(_active_indices(state["seats"])) == 1:
            return _award_pot_to_last_standing(state)
        state["currentTurnIndex"] = _next_active_index(state["seats"], seat_index)
        return state

    if type_ == "bet":
        required = state["stake"] * 2 if seat["seen"] else state["stake"]
        wager = amount if amount is not None else required
        if wager < required:
            raise EngineError(f"Must bet at least {required}")
        if wager > seat["chips"]:
            raise EngineError("Not enough chips — pack instead, all-in is not supported yet")

        seat["chips"] -= wager
        state["pot"] += wager
        is_raise = wager > required
        state["stake"] = (wager / 2 if seat["seen"] else wager) if is_raise else state["stake"]
        state["currentTurnIndex"] = _next_active_index(state["seats"], seat_index)
        return state

    if type_ == "show":
        active = _active_indices(state["seats"])
        if len(active) != 2:
            raise EngineError("Show is only allowed between the last 2 players")
        required = state["stake"] * 2 if seat["seen"] else state["stake"]
        wager = amount if amount is not None else required
        if wager < required:
            raise EngineError(f"Must pay at least {required} to call a show")
        if wager > seat["chips"]:
            raise EngineError("Not enough chips to call a show")

        seat["chips"] -= wager
        state["pot"] += wager
        a, b = active
        return _resolve_show(state, a, b)

    raise EngineError(f"Unknown action type: {type_}")
