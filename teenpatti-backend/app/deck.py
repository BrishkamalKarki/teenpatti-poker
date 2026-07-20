# builds 52-card deck and shuffles it

import random

SUITS = ["spades", "hearts", "diamonds", "clubs"]
RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"]


def build_deck():
    return [{"rank": rank, "suit": suit, "id": f"{rank}-{suit}"} for suit in SUITS for rank in RANKS]


def shuffle(deck):
    copy = list(deck)
    random.shuffle(copy)
    return copy
