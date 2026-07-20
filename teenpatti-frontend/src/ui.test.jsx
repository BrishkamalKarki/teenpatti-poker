/**
 * ui.test.jsx — smoke tests that actually render the screens.
 *
 *     npm test
 *
 * A build passing only proves the code parses. These prove the pages mount and
 * draw the right thing without a wallet, a server or a blockchain, which is
 * where the crashes actually live: a missing prop, a BigInt on a string field,
 * a seat that isn't there.
 *
 * The rules are tested on the backend (simulate.py); this is about the UI.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from './components/Toasts.jsx';
import { WalletProvider } from './components/Wallet.jsx';
import Table from './components/room/Table.jsx';
import ActionBar from './components/room/ActionBar.jsx';
import GameOver from './components/room/GameOver.jsx';
import Sidebar from './components/room/Sidebar.jsx';
import Lobby from './pages/Lobby.jsx';
import Room from './pages/Room.jsx';

// The server is stubbed: watchRoom hands back whatever state a test wants.
let mockState = null;
vi.mock('./lib/socket.js', () => ({
  getSocket: () => ({ on() {}, off() {}, emit() {} }),
  server: {
    watchRoom: (code, playerId, onState) => {
      if (mockState) onState(mockState);
      return () => {};
    },
    lookupRoom: vi.fn(async () => null),
    leaveRoom: vi.fn(),
    kickPlayer: vi.fn(async () => ({})),
  },
}));

const ETH = 10n ** 18n;
const wei = (n) => (ETH / 1000n) * BigInt(n); // n thousandths of an ETH

function seat(i, overrides = {}) {
  return {
    playerId: `0x${String(i + 1).padStart(40, '0')}`,
    name: ['Sita', 'Ram', 'Gita', 'Hari'][i],
    isHost: i === 0,
    packed: false,
    seen: false,
    cards: [
      { rank: 'A', suit: 'spades' },
      { rank: '10', suit: 'hearts' },
      { rank: '7', suit: 'clubs' },
    ],
    stakedWei: wei(10).toString(),
    lastAction: null,
    ...overrides,
  };
}

function roomState(overrides = {}) {
  return {
    roomCode: '7K9XM',
    gameId: 0,
    entryFeeWei: wei(10).toString(),
    maxSeats: 4,
    seats: [seat(0), seat(1), seat(2), seat(3)],
    potWei: wei(40).toString(),
    stakeWei: wei(10).toString(),
    phase: 'playing',
    dealerIndex: 0,
    currentTurnIndex: 1,
    winners: null,
    paid: false,
    txs: [],
    log: ['Cards dealt to 4 players'],
    you: null,
    ...overrides,
  };
}

const wrap = (ui, route = '/') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <ToastProvider>
        <WalletProvider>{ui}</WalletProvider>
      </ToastProvider>
    </MemoryRouter>
  );

beforeEach(() => {
  mockState = null;
  localStorage.clear();
});

// Vitest runs with globals off, so testing-library's automatic cleanup is not
// installed — without this, one test's DOM leaks into the next and queries
// find elements that are not on the screen under test.
afterEach(cleanup);

describe('Lobby', () => {
  it('renders both ways into a game', () => {
    wrap(<Lobby />);
    expect(screen.getByText('Create a room')).toBeDefined();
    expect(screen.getByText('Join with a code')).toBeDefined();
    // The entry fee is the headline number — it must be on the button.
    expect(screen.getByText(/Pay 0.001 ETH & open the table/)).toBeDefined();
  });
});

describe('Table', () => {
  it('shows four seats, the pot and the stake', () => {
    const state = roomState();
    const { container } = wrap(<Table state={state} playerId={state.seats[0].playerId} />);

    for (const name of ['Sita', 'Ram', 'Gita', 'Hari']) {
      expect(screen.getByText(name)).toBeDefined();
    }
    expect(screen.getByText('0.04 ETH')).toBeDefined(); // pot
    expect(screen.getByText('stake 0.01 ETH')).toBeDefined();
    expect(container.querySelectorAll('.seat').length).toBe(4);
  });

  it('puts YOU in the bottom seat whoever you are', () => {
    const state = roomState();
    const { container } = wrap(<Table state={state} playerId={state.seats[2].playerId} />);
    const bottom = container.querySelector('.seat--bottom');
    expect(within(bottom).getByText('Gita')).toBeDefined();
    expect(bottom.classList.contains('is-you')).toBe(true);
  });

  it('keeps every hand face down while the game is running', () => {
    const state = roomState();
    const { container } = wrap(<Table state={state} playerId={state.seats[0].playerId} />);
    // 4 players x 3 cards, and not one of them is a face — you have not looked
    // at yours yet (blind), and nobody else's are yours to see.
    expect(container.querySelectorAll('.card--back').length).toBe(12);
    expect(container.querySelectorAll('.card--face').length).toBe(0);
  });

  it('shows only YOUR cards once you have looked at them', () => {
    const state = roomState();
    state.seats[0].seen = true;
    const { container } = wrap(<Table state={state} playerId={state.seats[0].playerId} />);
    expect(container.querySelectorAll('.card--face').length).toBe(3);
    expect(container.querySelectorAll('.card--back').length).toBe(9);
  });

  it('turns over everyone still in the hand at the showdown', () => {
    const state = roomState({
      phase: 'finished',
      currentTurnIndex: -1,
      winners: [{ playerId: seat(1).playerId, name: 'Ram', label: 'Color', amountWei: wei(40).toString() }],
    });
    state.seats[2].packed = true;
    state.seats[3].packed = true;
    const { container } = wrap(<Table state={state} playerId={state.seats[0].playerId} />);
    // Sita and Ram are shown (6 cards); the two who packed keep theirs hidden.
    expect(container.querySelectorAll('.card--face').length).toBe(6);
    expect(screen.getByText('Wins 0.04 ETH')).toBeDefined();
  });
});

describe('ActionBar', () => {
  const base = {
    you: seat(0),
    isYourTurn: true,
    canShow: false,
    pending: null,
    onSee: vi.fn(),
    onPack: vi.fn(),
    onBet: vi.fn(),
    onShow: vi.fn(),
  };

  it('charges a blind player the stake', () => {
    wrap(<ActionBar {...base} owedWei={wei(10)} />);
    expect(screen.getByText('0.01 ETH')).toBeDefined();
    expect(screen.getByText(/blind/)).toBeDefined();
    expect(screen.getByText(/Chaal 0.01 ETH/)).toBeDefined();
    expect(screen.getByText(/See cards/)).toBeDefined();
  });

  it('charges a seen player double, and stops offering "see"', () => {
    wrap(<ActionBar {...base} you={seat(0, { seen: true })} owedWei={wei(20)} />);
    expect(screen.getByText(/Chaal 0.02 ETH/)).toBeDefined();
    expect(screen.getByText(/seen — double stake/)).toBeDefined();
    expect(screen.queryByText(/See cards/)).toBeNull();
  });

  it('only offers a show when two players are left', () => {
    const { rerender } = wrap(<ActionBar {...base} owedWei={wei(10)} />);
    expect(screen.queryByText(/^Show/)).toBeNull();

    rerender(
      <MemoryRouter>
        <ToastProvider>
          <WalletProvider>
            <ActionBar {...base} canShow owedWei={wei(10)} />
          </WalletProvider>
        </ToastProvider>
      </MemoryRouter>
    );
    expect(screen.getByText(/Show 0.01 ETH/)).toBeDefined();
  });

  it('disables everything when it is not your turn', () => {
    const { container } = wrap(
      <ActionBar {...base} isYourTurn={false} owedWei={wei(10)} />
    );
    const buttons = [...container.querySelectorAll('.btn')];
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((b) => b.disabled)).toBe(true);
  });
});

describe('Sidebar', () => {
  it('lists players, stakes and the game id', () => {
    const state = roomState();
    wrap(<Sidebar state={state} playerId={state.seats[0].playerId} isHost onOpenChain={vi.fn()} />);
    expect(screen.getByText('Players (4/4)')).toBeDefined();
    expect(screen.getByText('Sita (you)')).toBeDefined();
    expect(screen.getByText('#0')).toBeDefined();
    expect(screen.getByText('Cards dealt to 4 players')).toBeDefined();
  });
});

describe('GameOver', () => {
  const finished = roomState({
    phase: 'finished',
    currentTurnIndex: -1,
    winners: [{ playerId: seat(1).playerId, name: 'Ram', label: 'Color', amountWei: wei(140).toString() }],
  });

  it('offers the host the payout, and says what it does', () => {
    wrap(<GameOver state={finished} playerId={seat(0).playerId} isHost onPayout={vi.fn()} onOpenChain={vi.fn()} />);
    expect(screen.getByText('Ram wins')).toBeDefined();
    expect(screen.getByText('0.14 ETH')).toBeDefined();
    expect(screen.getByText(/Send 0.14 ETH to the winner/)).toBeDefined();
  });

  it('tells a non-host to wait, and never shows them a payout button', () => {
    wrap(<GameOver state={finished} playerId={seat(2).playerId} isHost={false} onOpenChain={vi.fn()} />);
    expect(screen.getByText(/Waiting for the host/)).toBeDefined();
    expect(screen.queryByText(/Send .* to the winner/)).toBeNull();
  });

  it('once paid, the only way on is a new room', () => {
    wrap(
      <GameOver
        state={{ ...finished, paid: true }}
        playerId={seat(1).playerId}
        isHost
        onOpenChain={vi.fn()}
      />
    );
    expect(screen.getByText('You win!')).toBeDefined();
    expect(screen.getByText('Sent on-chain ✓')).toBeDefined();
    expect(screen.getByText('New game')).toBeDefined();
  });
});

describe('Room page', () => {
  it('renders a whole table from live server state', () => {
    mockState = roomState();
    localStorage.setItem(
      'teenpatti.session',
      JSON.stringify({ roomCode: '7K9XM', playerId: seat(0).playerId, name: 'Sita' })
    );

    const { container } = wrap(
      <Routes>
        <Route path="/room/:roomCode" element={<Room />} />
      </Routes>,
      '/room/7K9XM'
    );

    expect(screen.getByText('7K9XM')).toBeDefined();
    expect(screen.getByText('Pot 0.04 ETH')).toBeDefined();
    expect(screen.getByText('4/4 seated')).toBeDefined();
    expect(screen.getAllByText(/Blockchain details/).length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.seat').length).toBe(4);
  });

  it('waits for the host to deal, and lets the host do it', () => {
    mockState = roomState({
      phase: 'waiting',
      currentTurnIndex: -1,
      seats: [seat(0, { cards: [] }), seat(1, { cards: [] }), null, null],
      potWei: wei(20).toString(),
    });
    localStorage.setItem(
      'teenpatti.session',
      JSON.stringify({ roomCode: '7K9XM', playerId: seat(0).playerId, name: 'Sita' })
    );

    wrap(
      <Routes>
        <Route path="/room/:roomCode" element={<Room />} />
      </Routes>,
      '/room/7K9XM'
    );

    expect(screen.getByText('Deal the cards')).toBeDefined();
    expect(screen.getByText(/Cancel & refund everyone/)).toBeDefined();
    expect(screen.getByText('2/4 seated')).toBeDefined();
  });
});
