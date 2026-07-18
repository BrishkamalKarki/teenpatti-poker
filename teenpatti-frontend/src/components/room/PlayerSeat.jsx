import PlayingCard from '../common/PlayingCard.jsx';
import ChipStack from '../common/ChipStack.jsx';
import './PlayerSeat.css';

function initials(name) {
  return name?.trim().slice(0, 2).toUpperCase() || '?';
}

export default function PlayerSeat({ seat, isYou, position, isDealer, isTurn, revealAll, winnerLabel }) {
  const style = {
    left: `${position.x}%`,
    top: `${position.y}%`,
  };

  if (!seat) {
    return (
      <div className="player-seat player-seat--empty" style={style}>
        <div className="player-seat__empty-ring">
          <span className="player-seat__empty-plus">+</span>
        </div>
        <span className="player-seat__empty-label">Empty seat</span>
        <span className="player-seat__empty-sub">Join from the Lobby</span>
      </div>
    );
  }

  const hasCards = seat.cards && seat.cards.length === 3;
  // You always see your own cards once dealt; others only see them face-up at
  // showdown (revealAll), and never if that player packed.
  const showFaceUp = hasCards && (isYou || (revealAll && !seat.packed));

  return (
    <div
      className={`player-seat ${seat.packed ? 'is-folded' : ''} ${isYou ? 'is-you' : ''} ${
        isTurn ? 'is-turn' : ''
      }`}
      style={style}
    >
      {isDealer && <span className="player-seat__dealer-btn">D</span>}
      {hasCards && (
        <div className="player-seat__cards">
          <PlayingCard card={seat.cards[0]} faceDown={!showFaceUp} size="sm" />
          <PlayingCard card={seat.cards[1]} faceDown={!showFaceUp} size="sm" />
          <PlayingCard card={seat.cards[2]} faceDown={!showFaceUp} size="sm" />
        </div>
      )}
      <div className="player-seat__ring">
        <span className="player-seat__avatar">{initials(seat.name)}</span>
        <span className="player-seat__name">{seat.name}</span>
        <span className="player-seat__chips">{seat.chips?.toLocaleString()}</span>
      </div>
      {isYou && hasCards && !seat.packed && (
        <span className={`player-seat__seen-tag ${seat.seen ? 'is-seen' : ''}`}>
          {seat.seen ? 'Seen' : 'Blind'}
        </span>
      )}
      {seat.isHost && <span className="player-seat__host-tag">Host</span>}
      {seat.packed && <span className="player-seat__folded-tag">Packed</span>}
      {winnerLabel && <span className="player-seat__winner-tag">Winner — {winnerLabel}</span>}
    </div>
  );
}
