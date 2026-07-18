import { useEffect, useState } from 'react';
import Button from '../common/Button.jsx';
import './ActionBar.css';

/**
 * Nepali Teen Patti actions:
 *   See Cards — look at your hand; doubles your required stake from then on.
 *   Pack       — fold, out of this round.
 *   Chaal      — call the current stake (or 2x if you've seen your cards).
 *   Raise      — call plus raise, sets a new table stake.
 *   Show       — only offered once you're heads-up with one opponent.
 */
export default function ActionBar({
  chips = 0,
  stake = 0,
  hasSeen = false,
  canShow = false,
  disabled = false,
  onAction,
}) {
  const required = hasSeen ? stake * 2 : stake;
  const floor = Math.min(Math.max(required, 1), Math.max(chips, 1));
  const [betAmount, setBetAmount] = useState(floor);

  useEffect(() => {
    setBetAmount(floor);
  }, [floor]);

  const canAfford = chips >= required;

  return (
    <div className="action-bar">
      <div className="action-bar__buttons">
        {!hasSeen && (
          <Button variant="secondary" onClick={() => onAction('seeCards')} disabled={disabled}>
            See
          </Button>
        )}
        <Button variant="danger" onClick={() => onAction('pack')} disabled={disabled}>
          Pack
        </Button>
        <Button
          onClick={() => onAction('bet', required)}
          disabled={disabled || !canAfford}
        >
          Chaal {required.toLocaleString()}
        </Button>
        {canShow && (
          <Button
            variant="secondary"
            onClick={() => onAction('show', required)}
            disabled={disabled || !canAfford}
          >
            Show
          </Button>
        )}
      </div>

      <div className="action-bar__slider">
        <input
          type="range"
          min={floor}
          max={Math.max(chips, floor)}
          value={betAmount}
          onChange={(e) => setBetAmount(Number(e.target.value))}
          disabled={disabled || chips === 0}
        />
        <span className="action-bar__amount">{betAmount.toLocaleString()}</span>
        <Button
          size="sm"
          onClick={() => onAction('bet', betAmount)}
          disabled={disabled || chips === 0 || betAmount <= required}
        >
          Raise to {betAmount.toLocaleString()}
        </Button>
      </div>

      {hasSeen && (
        <p className="action-bar__hint">You've seen your cards — your stake is now doubled</p>
      )}
    </div>
  );
}
