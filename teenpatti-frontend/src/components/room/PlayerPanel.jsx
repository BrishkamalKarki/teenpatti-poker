import ChipStack from '../common/ChipStack.jsx';
import './PlayerPanel.css';

const AVATAR_COLORS = ['#dc143c', '#003893', '#d4af37', '#8a1c2e', '#1d5fd6', '#97822a'];

function initials(name) {
  return name?.trim().slice(0, 2).toUpperCase() || '?';
}

function colorFor(playerId) {
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) hash = (hash * 31 + playerId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export default function PlayerPanel({ seats, playerId, currentTurnIndex, dealerIndex }) {
  const players = seats
    .map((seat, index) => ({ seat, index }))
    .filter(({ seat }) => seat);

  if (players.length === 0) return null;

  return (
    <aside className="player-panel">
      <span className="player-panel__title">Players &amp; Chips</span>
      <ul className="player-panel__list">
        {players.map(({ seat, index }) => {
          const isYou = seat.playerId === playerId;
          const isTurn = index === currentTurnIndex;
          const isDealer = index === dealerIndex;
          return (
            <li
              key={seat.playerId}
              className={`player-panel__row ${isTurn ? 'is-turn' : ''} ${seat.packed ? 'is-folded' : ''}`}
            >
              <div
                className="player-panel__avatar"
                style={{ '--avatar-color': colorFor(seat.playerId) }}
              >
                {initials(seat.name)}
                <span className="player-panel__presence-dot" />
              </div>

              <div className="player-panel__body">
                <div className="player-panel__row-top">
                  <span className="player-panel__name">
                    {seat.name}
                    {isYou && <span className="player-panel__you-tag">You</span>}
                  </span>
                  {isDealer && <span className="player-panel__dealer-tag">D</span>}
                </div>

                <div className="player-panel__row-bottom">
                  <ChipStack total={seat.chips} size="sm" />
                  {seat.seen && !seat.packed && (
                    <span className="player-panel__bet">Seen</span>
                  )}
                </div>

                <div className="player-panel__status">
                  {seat.packed ? (
                    <span className="player-panel__status-folded">Packed</span>
                  ) : isTurn ? (
                    <span className="player-panel__status-turn">● Playing</span>
                  ) : seat.isHost ? (
                    'Host'
                  ) : (
                    'Waiting'
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
