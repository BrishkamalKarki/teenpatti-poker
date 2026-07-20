# Game server

## Files

- **`app/engine.py`** — All the Teen Patti rules: seating, dealing, betting,
  packing, and picking a winner. Plain functions on a state dict, nothing
  else, so it's easy to test on its own.

- **`app/evaluator.py`** — Looks at a player's 3 cards and scores the hand
  (trail, sequence, color, pair, etc). Also compares two scores to say which
  one wins.

- **`app/deck.py`** — Builds a standard 52-card deck and shuffles it. That's
  the entire file.

- **`app/rooms.py`** — Keeps every room in memory and hands back the room to
  anyone who asks. Also makes sure each player only ever sees their own cards.

- **`app/server.py`** — The Socket.IO server itself. Listens for events like
  join/bet/pack from the frontend and replies with the updated room state.

- **`app/chain.py`** — Double-checks that a bet a player claims to have made
  really happened on the blockchain. Optional — skipped if not configured.