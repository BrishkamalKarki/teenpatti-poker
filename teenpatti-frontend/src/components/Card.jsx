// renders the card

const SUIT_LETTER = { spades: 'S', hearts: 'H', diamonds: 'D', clubs: 'C' };

export default function Card({ card, faceDown = false, size = 'md' }) {
  if (faceDown || !card) {
    return (
      <div className={`card card--${size} card--back`} aria-label="Face-down card">
        <span className="card__back-emblem" />
      </div>
    );
  }

  const src = `/cards/${SUIT_LETTER[card.suit]}${card.rank}.svg`;
  return (
    <div className={`card card--${size} card--face`}>
      <img src={src} alt={`${card.rank} of ${card.suit}`} draggable="false" />
    </div>
  );
}

export function Hand({ cards, faceDown, size = 'md' }) {
  const slots = cards && cards.length === 3 ? cards : [null, null, null];
  return (
    <div className="hand">
      {slots.map((card, i) => (
        <Card key={i} card={card} faceDown={faceDown || !card} size={size} />
      ))}
    </div>
  );
}
