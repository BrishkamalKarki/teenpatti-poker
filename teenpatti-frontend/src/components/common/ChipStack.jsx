import Chip from './Chip.jsx';
import './ChipStack.css';

function breakIntoChips(total) {
  const denoms = [1000, 500, 100, 25, 5, 1];
  const chips = [];
  let remaining = total;
  for (const d of denoms) {
    while (remaining >= d && chips.length < 5) {
      chips.push(d);
      remaining -= d;
    }
  }
  return chips.length ? chips : [1];
}

export default function ChipStack({ total, size = 'sm', showLabel = true }) {
  const chips = breakIntoChips(total);
  return (
    <div className={`chip-stack chip-stack--${size}`}>
      <div className="chip-stack__pile">
        {chips.map((value, i) => (
          <div key={i} className="chip-stack__chip" style={{ '--i': i }}>
            <Chip value={value} size={size} />
          </div>
        ))}
      </div>
      {showLabel && <span className="chip-stack__label">{total.toLocaleString()}</span>}
    </div>
  );
}
