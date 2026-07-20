// gamearena of the website

import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ActionBar from '../components/room/ActionBar.jsx';
import BlockchainPanel from '../components/room/BlockchainPanel.jsx';
import GameOver from '../components/room/GameOver.jsx';
import Sidebar from '../components/room/Sidebar.jsx';
import Table from '../components/room/Table.jsx';
import { useToast } from '../components/Toasts.jsx';
import { useWallet, WalletButton } from '../components/Wallet.jsx';
import { Badge, Button, CopyText } from '../components/ui.jsx';
import { abortGame, finishGame, placeBet, readableError, startGame } from '../lib/contract.js';
import { ethLabel } from '../lib/format.js';
import { clearSession, sessionFor } from '../lib/session.js';
import { server } from '../lib/socket.js';
import '../styles/room.css';

export default function Room() {
  const { roomCode } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { ensureConnected, refreshBalance } = useWallet();

  const [state, setState] = useState(null);
  const [gone, setGone] = useState(false);
  const [pending, setPending] = useState(null); // label of the transaction in flight
  const [showChain, setShowChain] = useState(false);

  const session = sessionFor(roomCode);
  const playerId = session?.playerId ?? null;

  // live updates
  useEffect(() => {
    return server.watchRoom(roomCode, playerId, setState, () => setGone(true));
  }, [roomCode, playerId]);

  const run = useCallback(
    async (label, work) => {
      setPending(label);
      try {
        await work();
      } catch (error) {
        toast(readableError(error), 'error');
      } finally {
        setPending(null);
        refreshBalance();
      }
    },
    [toast, refreshBalance]
  );

  if (gone) {
    return (
      <Empty
        title="This room is closed"
        body="A Teen Patti room lasts for one game. Head back and open a new one."
        onBack={() => navigate('/')}
      />
    );
  }

  if (!state) {
    return <Empty title="Finding the table…" body={`Room ${roomCode}`} />;
  }

  const seats = state.seats;
  const you = seats.find((s) => s && s.playerId === playerId) || null;
  const seated = seats.filter(Boolean);
  const isHost = Boolean(you?.isHost);
  const isYourTurn = you && seats[state.currentTurnIndex]?.playerId === playerId;
  const activeCount = seats.filter((s) => s && !s.packed).length;

  const owedWei = you ? BigInt(state.stakeWei) * (you.seen ? 2n : 1n) : 0n;

  const handleDeal = () =>
    run('Dealing…', async () => {
      await ensureConnected();
      const { txHash } = await startGame(state.gameId);
      await server.startGame({ roomCode, playerId, txHash });
    });

  const handleBet = (action, amountWei) =>
    run(`Sending ${ethLabel(amountWei)}…`, async () => {
      await ensureConnected();
      const { txHash } = await placeBet({ gameId: state.gameId, amountWei });
      await server.sendAction({ roomCode, playerId, action, amountWei: amountWei.toString(), txHash });
    });

  const handleFree = (action) =>
    run(null, () => server.sendAction({ roomCode, playerId, action }));

  const handlePayout = () =>
    run('Paying the winner…', async () => {
      await ensureConnected();
      const winners = state.winners.map((w) => w.playerId);
      const { txHash } = await finishGame({ gameId: state.gameId, winners });
      await server.finishGame({ roomCode, playerId, txHash });
    });

  const handleAbort = () =>
    run('Refunding everyone…', async () => {
      await ensureConnected();
      await abortGame(state.gameId);
      server.leaveRoom({ roomCode, playerId });
      clearSession();
      toast('Room cancelled — every entry fee was refunded', 'success');
      navigate('/');
    });

  const handleKick = (targetId) =>
    run(null, () => server.kickPlayer({ roomCode, playerId, targetId }));

  function handleLeave() {
    server.leaveRoom({ roomCode, playerId });
    clearSession();
    navigate('/');
  }

  return (
    <div className="room">
      <header className="room__head">
        <div className="room__head-left">
          <button type="button" className="room__back" onClick={handleLeave} title="Leave the table">
            ←
          </button>
          <div>
            <p className="eyebrow">Room code</p>
            <CopyText value={state.roomCode} display={<span className="room__code">{state.roomCode}</span>} />
          </div>
        </div>

        <div className="room__head-right">
          <Badge tone="gold">Pot {ethLabel(state.potWei)}</Badge>
          <Badge>
            {seated.length}/{state.maxSeats} seated
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => setShowChain(true)}>
            ⛓ Blockchain details
          </Button>
          <WalletButton />
        </div>
      </header>

      <div className="room__body">
        <main className="room__table-area">
          <Table state={state} playerId={playerId} />
          <Status
            state={state}
            you={you}
            isHost={isHost}
            isYourTurn={isYourTurn}
            pending={pending}
            onDeal={handleDeal}
            onAbort={handleAbort}
          />
        </main>

        <Sidebar
          state={state}
          playerId={playerId}
          isHost={isHost}
          pending={pending}
          onKick={handleKick}
          onOpenChain={() => setShowChain(true)}
        />
      </div>

      {state.phase === 'playing' && you && !you.packed && (
        <ActionBar
          you={you}
          owedWei={owedWei}
          isYourTurn={isYourTurn}
          canShow={activeCount === 2}
          pending={pending}
          onSee={() => handleFree('see')}
          onPack={() => handleFree('pack')}
          onBet={(amountWei) => handleBet('bet', amountWei)}
          onShow={(amountWei) => handleBet('show', amountWei)}
        />
      )}

      {state.phase === 'finished' && (
        <GameOver
          state={state}
          playerId={playerId}
          isHost={isHost}
          pending={pending}
          onPayout={handlePayout}
          onOpenChain={() => setShowChain(true)}
        />
      )}

      {showChain && <BlockchainPanel state={state} onClose={() => setShowChain(false)} />}
    </div>
  );
}

function Status({ state, you, isHost, isYourTurn, pending, onDeal, onAbort }) {
  const seated = state.seats.filter(Boolean).length;

  if (pending) {
    return (
      <div className="status">
        <span className="spinner" style={{ color: 'var(--gold)' }} />
        <span>{pending} — confirm in your wallet if it asks.</span>
      </div>
    );
  }

  if (state.phase === 'waiting') {
    return (
      <div className="status status--stack">
        <p>
          {seated < 2
            ? 'Share the room code — you need at least one more player.'
            : `${seated} players are in. The host can deal whenever you are ready.`}
        </p>
        {isHost && (
          <div className="row">
            <Button onClick={onDeal} disabled={seated < 2}>
              Deal the cards
            </Button>
            <Button variant="ghost" onClick={onAbort}>
              Cancel & refund everyone
            </Button>
          </div>
        )}
        {!isHost && you && <p className="muted">Waiting for the host to deal…</p>}
      </div>
    );
  }

  if (state.phase === 'playing') {
    const turnSeat = state.seats[state.currentTurnIndex];
    if (isYourTurn) return <div className="status status--you">Your turn</div>;
    return <div className="status">Waiting for {turnSeat?.name ?? 'the next player'}…</div>;
  }

  // Finished: the GameOver overlay sits on top and owns the payout button,
  // so there is nothing left for this line to say.
  return null;
}

function Empty({ title, body, onBack }) {
  return (
    <div className="room room--empty">
      <h2>{title}</h2>
      <p className="muted">{body}</p>
      {onBack && <Button onClick={onBack}>Back to the lobby</Button>}
    </div>
  );
}
