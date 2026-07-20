// loads at the end of the end of the room

import { useNavigate } from 'react-router-dom';
import { Badge, Button } from '../ui.jsx';
import { clearSession } from '../../lib/session.js';
import { ethLabel } from '../../lib/format.js';

export default function GameOver({ state, playerId, isHost, pending, onPayout, onOpenChain }) {
  const navigate = useNavigate();
  const winners = state.winners || [];
  const youWon = winners.some((w) => w.playerId === playerId);
  const total = winners.reduce((sum, w) => sum + BigInt(w.amountWei), 0n);

  function newGame() {
    clearSession();
    navigate('/');
  }

  return (
    <div className="gameover">
      <div className="gameover__card">
        <p className="eyebrow">{state.paid ? 'Pot paid out' : 'Hand finished'}</p>

        <h2 className="gameover__title">
          {youWon ? 'You win!' : `${winners.map((w) => w.name).join(' & ')} wins`}
        </h2>

        <p className="gameover__amount">{ethLabel(total)}</p>
        <p className="muted">{winners[0]?.label}</p>

        <p className="gameover__note">
          The winner takes the entire pot — every entry fee and every bet from every round of this game.
        </p>

        {state.paid ? (
          <>
            <Badge tone="green">Sent on-chain ✓</Badge>
            <div className="gameover__actions">
              <Button variant="ghost" onClick={onOpenChain}>
                ⛓ See the transactions
              </Button>
              <Button onClick={newGame}>New game</Button>
            </div>
          </>
        ) : isHost ? (
          <>
            <div className="gameover__actions">
              <Button size="lg" onClick={onPayout} busy={Boolean(pending)}>
                {pending || `Send ${ethLabel(total)} to the winner`}
              </Button>
            </div>
            <p className="muted" style={{ marginTop: 'var(--s3)' }}>
              One last transaction: <span className="mono">finishGame()</span> empties the contract into the
              winner's wallet and closes the room for good.
            </p>
          </>
        ) : (
          <>
            <Badge>Waiting for the host to send the payout…</Badge>
            <div className="gameover__actions">
              <Button variant="ghost" onClick={onOpenChain}>
                ⛓ See the transactions
              </Button>
              <Button variant="ghost" onClick={newGame}>
                Leave
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
