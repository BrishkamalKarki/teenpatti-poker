"""deck.py — 1:1 port of the frontend's src/utils/deck.js.

Kept deliberately dumb: build a standard 52-card deck, Fisher-Yates shuffle it.
Card shape matches the JS side exactly so the JSON sent over the socket looks
identical to what the frontend's own local engine would produce:
    { "rank": "A", "suit": "spades", "id": "A-spades" }
"""
import random

SUITS = ["spades", "hearts", "diamonds", "clubs"]
RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]


def build_deck():
    return [{"rank": rank, "suit": suit, "id": f"{rank}-{suit}"} for suit in SUITS for rank in RANKS]


def shuffle(deck):
    copy = list(deck)
    random.shuffle(copy)
    return copy
