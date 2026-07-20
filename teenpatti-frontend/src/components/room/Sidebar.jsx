// details of the players on the right sided bar

import { Badge, Button, CopyText, Panel } from '../ui.jsx';
import { ethLabel, shortAddress } from '../../lib/format.js';

export default function Sidebar({ state, playerId, isHost, pending, onKick, onOpenChain }) {
  const seated = state.seats.filter(Boolean);

  return (
    <aside className="sidebar">
      <Panel title="This game">
        <div className="kv">
          <span className="kv__key">Entry fee</span>
          <span className="kv__value">{ethLabel(state.entryFeeWei)} each</span>

          <span className="kv__key">Pot</span>
          <span className="kv__value">{ethLabel(state.potWei)}</span>

          <span className="kv__key">Stake</span>
          <span className="kv__value">{ethLabel(state.stakeWei)}</span>

          <span className="kv__key">Game id</span>
          <span className="kv__value mono">#{state.gameId}</span>
        </div>

        <Button variant="ghost" size="sm" full onClick={onOpenChain} style={{ marginTop: 'var(--s3)' }}>
          ⛓ View blockchain details
        </Button>
      </Panel>

      <Panel title={`Players (${seated.length}/${state.maxSeats})`}>
        <ul className="players">
          {seated.map((seat) => {
            const isTurn = state.seats[state.currentTurnIndex]?.playerId === seat.playerId;
            return (
              <li key={seat.playerId} className={`players__row ${isTurn ? 'is-turn' : ''}`}>
                <span className="players__dot" />
                <div className="players__who">
                  <span className="players__name">
                    {seat.name}
                    {seat.playerId === playerId && ' (you)'}
                  </span>
                  <CopyText
                    value={seat.playerId}
                    display={<span className="mono players__address">{shortAddress(seat.playerId)}</span>}
                  />
                </div>
                <div className="players__right">
                  <span className="players__staked">{ethLabel(seat.stakedWei)}</span>
                  {seat.packed ? (
                    <Badge tone="red">Packed</Badge>
                  ) : (
                    <Badge tone={seat.seen ? 'blue' : undefined}>{seat.seen ? 'Seen' : 'Blind'}</Badge>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="What happened">
        <ol className="log">
          {[...state.log].reverse().map((line, i) => (
            <li key={state.log.length - i} className="log__line">
              {line}
            </li>
          ))}
        </ol>
      </Panel>

      {isHost && state.phase === 'playing' && (
        <HostTools state={state} playerId={playerId} pending={pending} onKick={onKick} />
      )}
    </aside>
  );
}

/** What only the host can do, spelled out so nobody has to hunt for it. */
function HostTools({ state, playerId, pending, onKick }) {
  const waitingOn = state.seats[state.currentTurnIndex];
  // Only offer this against someone else — the host packs themselves with the
  // normal Pack button, on their own turn.
  const canKick = waitingOn && waitingOn.playerId !== playerId;

  return (
    <Panel title="You are the host">
      <p className="muted">
        When the hand ends you send one last transaction that pays the whole pot
        ({ethLabel(state.potWei)} so far) to the winner and closes the room.
      </p>

      {canKick && (
        <>
          <Button
            variant="ghost"
            size="sm"
            full
            busy={Boolean(pending)}
            onClick={() => onKick(waitingOn.playerId)}
            style={{ marginTop: 'var(--s3)' }}
          >
            Pack {waitingOn.name} — they left
          </Button>
          <p className="field__hint" style={{ marginTop: 'var(--s2)' }}>
            Only if they have genuinely gone. It folds their hand so the game can
            finish; their ETH stays in the pot, exactly as if they had packed.
          </p>
        </>
      )}
    </Panel>
  );
}
