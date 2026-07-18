import './Chip.css';

const DENOM_COLOR = {
  1: '#3d5a4c',
  5: '#a4372c',
  25: '#1f4d8c',
  100: '#1a1a1a',
  500: '#6b2d8c',
  1000: '#c9a24b',
};

export default function Chip({ value, size = 'md' }) {
  const color = DENOM_COLOR[value] || '#a4372c';
  return (
    <div className={`chip chip--${size}`} style={{ '--chip-color': color }}>
      <span className="chip__value">{value}</span>
    </div>
  );
}
