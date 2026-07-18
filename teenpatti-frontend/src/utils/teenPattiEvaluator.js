/**
 * teenPattiEvaluator.js — pure functions, no framework deps.
 * Ranks a 3-card Teen Patti hand and returns a comparable score.
 *
 * Score shape: [handRank, ...tiebreakers] where handRank is:
 *   5 trail (three of a kind), 4 pure sequence (straight flush),
 *   3 sequence (straight), 2 color (flush), 1 pair, 0 high card
 * Higher array (compared element by element, left to right) wins.
 *
 * Ace plays high in a trail/pair/high-card context (value 14), but a sequence
 * can be either A-2-3 (low, plays as value "1" for ordering below every other
 * sequence) or Q-K-A (high, the best sequence). This matches real Teen Patti play.
 */

const RANK_VALUE = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14,
};

export function evaluateThree(cards) {
  const values = cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);

  const counts = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.entries(counts)
    .map(([v, c]) => ({ value: Number(v), count: c }))
    .sort((a, b) => b.count - a.count || b.value - a.value);

  const isWheel = values.join(',') === '14,3,2';
  const isNormalRun = values[0] - values[1] === 1 && values[1] - values[2] === 1;
  let sequenceHigh = null;
  if (isWheel) sequenceHigh = 3;
  else if (isNormalRun) sequenceHigh = values[0];

  if (groups[0].count === 3) {
    return [5, groups[0].value]; // trail (teen)
  }
  if (isFlush && sequenceHigh) {
    return [4, sequenceHigh]; // pure sequence
  }
  if (sequenceHigh) {
    return [3, sequenceHigh]; // sequence
  }
  if (isFlush) {
    return [2, ...values]; // color
  }
  if (groups[0].count === 2) {
    const kicker = groups.find((g) => g.count === 1).value;
    return [1, groups[0].value, kicker]; // pair
  }
  return [0, ...values]; // high card
}

export function compareScores(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

export const HAND_NAMES = ['High Card', 'Pair', 'Color', 'Sequence', 'Pure Sequence', 'Trail'];

export function scoreLabel(score) {
  return HAND_NAMES[score[0]];
}
