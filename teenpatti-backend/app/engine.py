# handles the core game logic : managing room logic, dealing with the cards, enforcing the turns, determining the winners

from .deck import build_deck, shuffle
from .evaluator import evaluate_three, compare_scores, score_label

WAITING = "waiting"
PLAYING = "playing"
FINISHED = "finished"


def eth(wei):
    # formats the wei as short eth
    text = f"{int(wei) / 10**18:.6f}".rstrip("0").rstrip(".")
    return f"{text or '0'} ETH"


class EngineError(Exception):
    """A move the rules don't allow. The server turns these into a friendly
    error toast for the one player who tried it; nothing else is affected."""


def create_room_state(room_code, game_id, entry_fee_wei, max_seats):
    return {
        "roomCode": room_code,
        "gameId": game_id,
        "entryFeeWei": int(entry_fee_wei),
        "maxSeats": int(max_seats),
        "seats": [None] * int(max_seats),
        "deck": [],
        "potWei": 0,
        "stakeWei": int(entry_fee_wei),
        "phase": WAITING,
        "dealerIndex": 0,
        "currentTurnIndex": -1,
        "winners": None,
        "paid": False,
        "txs": [],
        "log": [],
    }


def _occupied(seats):
    return [i for i, s in enumerate(seats) if s]


def _active(seats):
    """Seats still in the hand: seated, dealt in, and not packed."""
    return [i for i, s in enumerate(seats) if s and not s["packed"]]


def _next_active_index(seats, from_index):
    n = len(seats)
    for step in range(1, n + 1):
        idx = (from_index + step) % n
        seat = seats[idx]
        if seat and not seat["packed"]:
            return idx
    return -1


def find_seat_index(state, player_id):
    return next((i for i, s in enumerate(state["seats"]) if s and s["playerId"] == player_id), -1)


def seat_player(state, player_id, name, is_host=False):
    """Sits a player in the first free chair. They have already paid the entry
    fee on-chain by the time this is called, so their money is in the pot."""
    if state["phase"] != WAITING:
        raise EngineError("This game has already started — ask the host for a new room code")
    if find_seat_index(state, player_id) != -1:
        raise EngineError("That wallet is already seated in this room")
    try:
        index = state["seats"].index(None)
    except ValueError:
        raise EngineError("Room is full") from None

    state["seats"][index] = {
        "playerId": player_id,
        "name": name,
        "isHost": is_host,
        "packed": False,
        "seen": False,
        "cards": [],
        "stakedWei": state["entryFeeWei"],
        "lastAction": None,
    }
    state["potWei"] += state["entryFeeWei"]
    add_log(state, f"{name} paid the {eth(state['entryFeeWei'])} entry fee and sat down")
    return state


def leave_seat(state, player_id):
    """Someone closed their tab or clicked Leave.

    Before the cards are out, they simply give up their chair (their entry fee
    stays in the pot — it is already inside the contract and only finishGame()
    can move it). Once a hand is in progress, leaving is treated as packing,
    exactly as if they had clicked Pack, so the hand can still finish.
    """
    index = find_seat_index(state, player_id)
    if index == -1:
        return state

    if state["phase"] == PLAYING:
        return _pack(state, index, voluntary=False)

    if state["phase"] == WAITING:
        add_log(state, f"{state['seats'][index]['name']} left the table")
        state["seats"][index] = None
    return state



def start_game(state):
    """Host deals. Called right after their startGame() transaction confirms."""
    if state["phase"] != WAITING:
        raise EngineError("The cards are already out")
    if len(_occupied(state["seats"])) < 2:
        raise EngineError("Need at least 2 players to deal")

    deck = shuffle(build_deck())
    for seat in state["seats"]:
        if seat:
            seat["cards"] = [deck.pop(), deck.pop(), deck.pop()]
            seat["packed"] = False
            seat["seen"] = False
            seat["lastAction"] = None

    occupied = _occupied(state["seats"])
    state["dealerIndex"] = occupied[0]
    state["currentTurnIndex"] = _next_active_index(state["seats"], occupied[0])
    state["deck"] = deck
    state["phase"] = PLAYING
    state["stakeWei"] = state["entryFeeWei"]
    state["winners"] = None
    add_log(state, f"Cards dealt to {len(occupied)} players — the stake is {eth(state['stakeWei'])}")
    return state


def required_bet_wei(state, seat):
    """What this player owes to stay in: the table stake, doubled if they have
    looked at their cards. The single most important rule in Teen Patti."""
    return state["stakeWei"] * 2 if seat["seen"] else state["stakeWei"]


def apply_action(state, player_id, action, amount_wei=None):
    """Applies one player's move.

    action   'see' | 'pack' | 'bet' | 'show'
    amount_wei  For 'bet'/'show': the exact wei the player just sent to the
                contract. Must be at least required_bet_wei(). Betting MORE
                than the minimum is a raise and lifts the stake for everyone.

    The caller (server.py) is responsible for confirming the matching on-chain
    transaction BEFORE calling this — the engine assumes the money has landed.
    """
    if state["phase"] != PLAYING:
        raise EngineError("No hand is in progress")

    index = find_seat_index(state, player_id)
    if index == -1:
        raise EngineError("You are not seated in this room")
    seat = state["seats"][index]
    if seat["packed"]:
        raise EngineError("You have packed — you are out of this hand")
    if index != state["currentTurnIndex"]:
        raise EngineError("It is not your turn")

    if action == "see":
        return _see(state, index)
    if action == "pack":
        return _pack(state, index)
    if action == "bet":
        return _bet(state, index, amount_wei)
    if action == "show":
        return _show(state, index, amount_wei)
    raise EngineError(f"Unknown action: {action}")


def _see(state, index):
    seat = state["seats"][index]
    if seat["seen"]:
        raise EngineError("You have already looked at your cards")
    seat["seen"] = True
    add_log(state, f"{seat['name']} looked at their cards — they now bet double")
    return state  # looking is free and does not pass the turn


def _pack(state, index, voluntary=True):
    seat = state["seats"][index]
    seat["packed"] = True
    seat["lastAction"] = "packed"
    add_log(state, f"{seat['name']} {'packed' if voluntary else 'left and was packed'}")

    active = _active(state["seats"])
    if len(active) == 1:
        return _finish_last_standing(state, active[0])

    if state["currentTurnIndex"] == index:
        state["currentTurnIndex"] = _next_active_index(state["seats"], index)
    return state


def _take_bet(state, index, amount_wei, verb):
    seat = state["seats"][index]
    required = required_bet_wei(state, seat)
    amount = int(amount_wei) if amount_wei is not None else required

    if amount < required:
        raise EngineError(f"You must {verb} at least {eth(required)} to stay in")

    seat["stakedWei"] += amount
    state["potWei"] += amount
    return amount, required


def _bet(state, index, amount_wei):
    seat = state["seats"][index]
    amount, required = _take_bet(state, index, amount_wei, "bet")

    if amount > required:
        state["stakeWei"] = amount // 2 if seat["seen"] else amount
        seat["lastAction"] = "raised"
        add_log(state, f"{seat['name']} raised to {eth(amount)} — the stake is now {eth(state['stakeWei'])}")
    else:
        seat["lastAction"] = "chaal"
        add_log(state, f"{seat['name']} played chaal for {eth(amount)}")

    state["currentTurnIndex"] = _next_active_index(state["seats"], index)
    return state


def _show(state, index, amount_wei):
    active = _active(state["seats"])
    if len(active) != 2:
        raise EngineError("A show is only possible when 2 players are left")

    seat = state["seats"][index]
    _take_bet(state, index, amount_wei, "pay")
    seat["lastAction"] = "show"
    add_log(state, f"{seat['name']} paid to call a show")

    a, b = active
    return _finish_show(state, a, b)


def _finish_last_standing(state, index):
    seat = state["seats"][index]
    _end(state, [{
        "playerId": seat["playerId"],
        "name": seat["name"],
        "label": "Everyone else packed",
        "amountWei": state["potWei"],
    }])
    add_log(state, f"{seat['name']} wins the pot — everyone else packed")
    return state


def _finish_show(state, index_a, index_b):
    a = state["seats"][index_a]
    b = state["seats"][index_b]
    score_a = evaluate_three(a["cards"])
    score_b = evaluate_three(b["cards"])
    result = compare_scores(score_a, score_b)

    if result == 0:
        half = state["potWei"] // 2
        _end(state, [
            {"playerId": a["playerId"], "name": a["name"],
             "label": f"{score_label(score_a)} — split pot", "amountWei": state["potWei"] - half},
            {"playerId": b["playerId"], "name": b["name"],
             "label": f"{score_label(score_b)} — split pot", "amountWei": half},
        ])
        add_log(state, f"Show: {a['name']} and {b['name']} tied — the pot is split")
    else:
        winner, score = (a, score_a) if result > 0 else (b, score_b)
        loser, loser_score = (b, score_b) if result > 0 else (a, score_a)
        _end(state, [{
            "playerId": winner["playerId"],
            "name": winner["name"],
            "label": score_label(score),
            "amountWei": state["potWei"],
        }])
        add_log(
            state,
            f"Show: {winner['name']}'s {score_label(score)} beats "
            f"{loser['name']}'s {score_label(loser_score)}",
        )
    return state


def _end(state, winners):
    state["winners"] = winners
    state["phase"] = FINISHED
    state["currentTurnIndex"] = -1
    return state


def mark_paid(state, tx_hash):
    """The host's finishGame() transaction confirmed: the contract has sent the
    pot to the winner(s) and this room is permanently over."""
    if state["phase"] != FINISHED:
        raise EngineError("The hand is not over yet")
    state["paid"] = True
    state["payoutTxHash"] = tx_hash
    add_log(state, "Pot paid out on-chain — room closed")
    return state



def add_log(state, text):
    state["log"].append(text)
    del state["log"][:-60]
    return state


def add_tx(state, *, kind, tx_hash, address, name, amount_wei=0):
    """Records one on-chain transaction so every player can inspect it in the
    'Blockchain details' panel — this list IS the audit trail of the game."""
    if not tx_hash:
        return state
    if any(t["hash"] == tx_hash for t in state["txs"]):
        return state
    state["txs"].append({
        "hash": tx_hash,
        "kind": kind,  # create | join | start | bet | show | payout
        "address": address,
        "name": name,
        "amountWei": int(amount_wei or 0),
    })
    return state
