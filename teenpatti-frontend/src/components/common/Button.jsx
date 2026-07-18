import './Button.css';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  onClick,
  type = 'button',
  disabled = false,
  full = false,
}) {
  return (
    <button
      type={type}
      className={`btn btn--${variant} btn--${size} ${full ? 'btn--full' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
