# evaluates the cards combination and returns the score

from collections import Counter

RANK_VALUE = {
    "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8,
    "9": 9, "10": 10, "J": 11, "Q": 12, "K": 13, "A": 14,
}

HAND_NAMES = ["High Card", "Pair", "Color", "Sequence", "Pure Sequence", "Trail"]


def evaluate_three(cards):
    values = sorted((RANK_VALUE[c["rank"]] for c in cards), reverse=True)
    suits = [c["suit"] for c in cards]
    is_flush = all(s == suits[0] for s in suits)

    counts = Counter(values)
    groups = sorted(
        ({"value": v, "count": c} for v, c in counts.items()),
        key=lambda g: (g["count"], g["value"]),
        reverse=True,
    )

    is_wheel = values == [14, 3, 2]
    is_normal_run = values[0] - values[1] == 1 and values[1] - values[2] == 1
    sequence_high = None
    if is_wheel:
        sequence_high = 3
    elif is_normal_run:
        sequence_high = values[0]

    if groups[0]["count"] == 3:
        return [5, groups[0]["value"]]  # trail (teen)
    if is_flush and sequence_high:
        return [4, sequence_high]  # pure sequence
    if sequence_high:
        return [3, sequence_high]  # sequence
    if is_flush:
        return [2, *values]  # color
    if groups[0]["count"] == 2:
        kicker = next(g["value"] for g in groups if g["count"] == 1)
        return [1, groups[0]["value"], kicker]  # pair
    return [0, *values]  # high card


def compare_scores(a, b):
    length = max(len(a), len(b))
    for i in range(length):
        av = a[i] if i < len(a) else 0
        bv = b[i] if i < len(b) else 0
        if av != bv:
            return av - bv
    return 0


def score_label(score):
    return HAND_NAMES[score[0]]
