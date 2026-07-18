import './Logo.css';

export default function Logo({ size = 'md' }) {
  return (
    <div className={`logo logo--${size}`}>
      <span className="logo__suit">🎴</span>
      <span className="logo__text">
        Teen <em>Patti</em>
      </span>
    </div>
  );
}
