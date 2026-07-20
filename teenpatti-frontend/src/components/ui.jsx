// defines the reusable UI components

import { useEffect, useState } from 'react';

export function Button({ variant, size, full, busy, children, ...props }) {
  const classes = ['btn'];
  if (variant) classes.push(`btn--${variant}`);
  if (size) classes.push(`btn--${size}`);
  if (full) classes.push('btn--full');

  return (
    <button type="button" className={classes.join(' ')} disabled={props.disabled || busy} {...props}>
      {busy && <span className="spinner" />}
      {children}
    </button>
  );
}

export function Panel({ title, action, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action) && (
        <header className="panel__title">
          <p className="eyebrow">{title}</p>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ tone, children }) {
  return <span className={`badge ${tone ? `badge--${tone}` : ''}`}>{children}</span>;
}

export function Modal({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal__head">
          <div>
            <h2 style={{ fontSize: 'var(--text-lg)' }}>{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

export function CopyText({ value, display, className = '' }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      title={`Copy ${value}`}
      className={`copy-text ${className}`}
      style={{
        background: 'none',
        border: 'none',
        padding: 0,
        color: 'inherit',
        font: 'inherit',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--s2)',
      }}
    >
      {display ?? value}
      <span style={{ fontSize: 'var(--text-xs)', color: copied ? 'var(--green)' : 'var(--muted)' }}>
        {copied ? 'copied' : 'copy'}
      </span>
    </button>
  );
}
