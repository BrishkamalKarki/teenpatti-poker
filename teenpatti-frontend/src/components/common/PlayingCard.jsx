import { SUIT_SYMBOL, SUIT_COLOR } from '../../utils/deck.js';
import './PlayingCard.css';

export default function PlayingCard({ card, faceDown = false, size = 'md' }) {
  if (faceDown || !card) {
    return (
      <div className={`playing-card playing-card--back playing-card--${size}`}>
        <div className="playing-card__back-pattern" />
      </div>
    );
  }

  const { rank, suit } = card;
  const color = SUIT_COLOR[suit];

  return (
    <div className={`playing-card playing-card--${size} playing-card--${color}`}>
      <span className="playing-card__corner playing-card__corner--top">
        {rank}
        <br />
        {SUIT_SYMBOL[suit]}
      </span>
      <span className="playing-card__pip">{SUIT_SYMBOL[suit]}</span>
      <span className="playing-card__corner playing-card__corner--bottom">
        {rank}
        <br />
        {SUIT_SYMBOL[suit]}
      </span>
    </div>
  );
}
