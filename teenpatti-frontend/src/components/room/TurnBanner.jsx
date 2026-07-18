import './TurnBanner.css';

/**
 * A prominent pill banner shown above the table announcing whose turn it is
 * (or the hand result). Replaces plain, easy-to-miss text that used to sit
 * at the bottom of the page.
 */
export default function TurnBanner({ isYourTurn, waitingOnName, winnerText, dealMessage }) {
  if (winnerText) {
    return (
      <div className="turn-banner turn-banner--winner">
        <span className="turn-banner__icon">🏆</span>
        <span>{winnerText}</span>
      </div>
    );
  }

  if (dealMessage) {
    return (
      <div className="turn-banner turn-banner--idle">
        <span>{dealMessage}</span>
      </div>
    );
  }

  if (!waitingOnName) return null;

  return (
    <div className={`turn-banner ${isYourTurn ? 'turn-banner--you' : ''}`}>
      <span className="turn-banner__dot" />
      <span>{isYourTurn ? 'Your turn' : `Waiting on ${waitingOnName}'s turn`}</span>
    </div>
  );
}
