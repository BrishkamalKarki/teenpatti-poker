/**
 * teenPattiEngine.js — pure functions, no framework/storage deps.
 * Takes a room `state` object and returns a NEW state object (never mutates in place).
 * This exact file is meant to be shared between the frontend (for optimistic/local
 * preview only) and the backend (source of truth) — gameplay rules must stay identical
 * in both places, so don't fork this file per-side.
 *
 * Seat shape: { playerId, name, chips, isHost, packed, seen, cards }
 * Room phase: 'waiting' -> 'playing' -> 'roundComplete' -> 'playing' -> ...
 *
 * Nepali Teen Patti rules encoded here:
 *   - Boot (ante): every seated player pays `bootAmount` into the pot before cards are dealt.
 *   - Blind vs Seen: a player who hasn't looked at their cards ("blind") owes `stake`
 *     per bet; once they look ("seen"), they owe `2 * stake`. This is the classic
 *     Nepali/Indian home-game convention — seeing your cards costs double.
 *   - Chaal: calling the current stake. Raising updates `stake` for the table.
 *   - Pack: folding. If only one player remains, they win the pot uncontested.
 *   - Show: once exactly 2 players remain, either can call a show by paying the
 *     current stake; hands are compared and the pot is awarded (split on an exact tie).
 *
 * Simplifications vs. real-table Teen Patti (documented on purpose, not bugs):
 *   - No side-show (privately comparing cards with the previous better mid-round).
 *   - No all-in / side pots — a bet must be fully covered by the player's chips,
 *     otherwise they must pack. Skipped to keep on-chain settlement simple for v1.
 */
import { buildDeck, shuffle } from './deck.js';
import { evaluateThree, compareScores, scoreLabel } from './teenPattiEvaluator.js';

export function createRoomState({ roomCode, maxSeats, bootAmount }) {
  return {
    roomCode,
    maxSeats,
    bootAmount,
    seats: Array.from({ length: maxSeats }, () => null),
    deck: [],
    pot: 0,
    stake: bootAmount,
    phase: 'waiting', // 'waiting' | 'playing' | 'roundComplete'
    dealerIndex: -1,
    currentTurnIndex: -1,
    winners: null,
  };
}

function occupiedIndices(seats) {
  const out = [];
  seats.forEach((s, i) => {
    if (s) out.push(i);
  });
  return out;
}

function nextOccupiedIndex(seats, fromIndex) {
  const occ = occupiedIndices(seats);
  if (occ.length === 0) return -1;
  const start = (fromIndex + 1) % seats.length;
  for (let i = 0; i < seats.length; i++) {
    const idx = (start + i) % seats.length;
    if (seats[idx]) return idx;
  }
  return occ[0];
}

function activeIndices(seats) {
  const out = [];
  seats.forEach((s, i) => {
    if (s && !s.packed) out.push(i);
  });
  return out;
}

function nextActiveIndex(seats, fromIndex) {
  const start = (fromIndex + 1) % seats.length;
  for (let i = 0; i < seats.length; i++) {
    const idx = (start + i) % seats.length;
    const s = seats[idx];
    if (s && !s.packed) return idx;
  }
  return -1;
}

/** Seats a player in the first open chair. Returns new state. */
export function seatPlayer(state, { playerId, name, chips, isHost = false }) {
  const seatIndex = state.seats.findIndex((s) => s === null);
  if (seatIndex === -1) throw new Error('Room is full');
  const seats = state.seats.map((s, i) =>
    i === seatIndex ? { playerId, name, chips, isHost, packed: false, seen: false, cards: [] } : s
  );
  return { ...state, seats };
}

/** Starts a new round: shuffles, deals 3 cards each, collects the boot (ante). */
export function startRound(state) {
  const occ = occupiedIndices(state.seats);
  if (occ.length < 2) throw new Error('Need at least 2 players to start a round');

  const deck = shuffle(buildDeck());
  let pot = 0;
  const seats = state.seats.map((s) => {
    if (!s) return s;
    if (s.chips < state.bootAmount) throw new Error(`${s.name} does not have enough chips for the boot`);
    pot += state.bootAmount;
    return {
      ...s,
      packed: false,
      seen: false,
      cards: [deck.pop(), deck.pop(), deck.pop()],
      chips: s.chips - state.bootAmount,
    };
  });

  const dealerIndex = nextOccupiedIndex(seats, state.dealerIndex ?? -1);
  const firstToAct = nextOccupiedIndex(seats, dealerIndex);

  return {
    ...state,
    seats,
    deck,
    pot,
    phase: 'playing',
    dealerIndex,
    currentTurnIndex: firstToAct,
    stake: state.bootAmount,
    winners: null,
  };
}

function awardPotToLastStanding(state) {
  const [onlyIndex] = activeIndices(state.seats);
  const winnerSeat = state.seats[onlyIndex];
  const seats = state.seats.map((s, i) => (i === onlyIndex ? { ...s, chips: s.chips + state.pot } : s));
  return {
    ...state,
    seats,
    phase: 'roundComplete',
    pot: 0,
    winners: [{ playerId: winnerSeat.playerId, name: winnerSeat.name, label: 'Won — everyone else packed', amount: state.pot }],
    currentTurnIndex: -1,
  };
}

function resolveShow(state, seatIndexA, seatIndexB) {
  const a = state.seats[seatIndexA];
  const b = state.seats[seatIndexB];
  const scoreA = evaluateThree(a.cards);
  const scoreB = evaluateThree(b.cards);
  const cmp = compareScores(scoreA, scoreB);

  let winners;
  let seats = state.seats;
  if (cmp === 0) {
    const share = Math.floor(state.pot / 2);
    const remainder = state.pot - share * 2;
    seats = state.seats.map((s, i) => {
      if (i === seatIndexA) return { ...s, chips: s.chips + share + remainder };
      if (i === seatIndexB) return { ...s, chips: s.chips + share };
      return s;
    });
    winners = [
      { playerId: a.playerId, name: a.name, label: `${scoreLabel(scoreA)} (Pot split)`, amount: share + remainder },
      { playerId: b.playerId, name: b.name, label: `${scoreLabel(scoreB)} (Pot split)`, amount: share },
    ];
  } else {
    const winnerIndex = cmp > 0 ? seatIndexA : seatIndexB;
    const winnerScore = cmp > 0 ? scoreA : scoreB;
    seats = state.seats.map((s, i) => (i === winnerIndex ? { ...s, chips: s.chips + state.pot } : s));
    const winnerSeat = state.seats[winnerIndex];
    winners = [{ playerId: winnerSeat.playerId, name: winnerSeat.name, label: scoreLabel(winnerScore), amount: state.pot }];
  }

  return { ...state, seats, phase: 'roundComplete', pot: 0, winners, currentTurnIndex: -1 };
}

/**
 * Applies one player action. Returns a new state.
 * type: 'seeCards' | 'pack' | 'bet' | 'show'
 * amount: for 'bet'/'show', the TOTAL chips wagered this action (must be >= the
 *         required minimum for the player's blind/seen status). Omit to call the minimum.
 */
export function applyAction(state, { playerId, type, amount }) {
  if (state.phase !== 'playing') throw new Error('No active round');
  const seatIndex = state.seats.findIndex((s) => s && s.playerId === playerId);
  if (seatIndex === -1) throw new Error('Player not seated');

  if (type === 'seeCards') {
    if (seatIndex !== state.currentTurnIndex) throw new Error('Not your turn');
    const seats = state.seats.map((s, i) => (i === seatIndex ? { ...s, seen: true } : s));
    return { ...state, seats }; // seeing your cards doesn't pass the turn
  }

  if (seatIndex !== state.currentTurnIndex) throw new Error('Not your turn');
  const seat = state.seats[seatIndex];

  if (type === 'pack') {
    const seats = state.seats.map((s, i) => (i === seatIndex ? { ...s, packed: true } : s));
    const nextState = { ...state, seats };
    if (activeIndices(seats).length === 1) return awardPotToLastStanding(nextState);
    return { ...nextState, currentTurnIndex: nextActiveIndex(seats, seatIndex) };
  }

  if (type === 'bet') {
    const required = seat.seen ? state.stake * 2 : state.stake;
    const wager = amount ?? required;
    if (wager < required) throw new Error(`Must bet at least ${required}`);
    if (wager > seat.chips) throw new Error('Not enough chips — pack instead, all-in is not supported yet');

    const seats = state.seats.map((s, i) => (i === seatIndex ? { ...s, chips: s.chips - wager } : s));
    const isRaise = wager > required;
    const stake = isRaise ? (seat.seen ? wager / 2 : wager) : state.stake;

    return {
      ...state,
      seats,
      pot: state.pot + wager,
      stake,
      currentTurnIndex: nextActiveIndex(seats, seatIndex),
    };
  }

  if (type === 'show') {
    const active = activeIndices(state.seats);
    if (active.length !== 2) throw new Error('Show is only allowed between the last 2 players');
    const required = seat.seen ? state.stake * 2 : state.stake;
    const wager = amount ?? required;
    if (wager < required) throw new Error(`Must pay at least ${required} to call a show`);
    if (wager > seat.chips) throw new Error('Not enough chips to call a show');

    const seats = state.seats.map((s, i) => (i === seatIndex ? { ...s, chips: s.chips - wager } : s));
    const [a, b] = active;
    return resolveShow({ ...state, seats, pot: state.pot + wager }, a, b);
  }

  throw new Error(`Unknown action type: ${type}`);
}
