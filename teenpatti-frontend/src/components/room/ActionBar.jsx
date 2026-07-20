
import { useEffect, useState } from 'react';
import { Button } from '../ui.jsx';
import { ethLabel } from '../../lib/format.js';

const MAX_MULTIPLIER = 5;

export default function ActionBar({
  you,
  owedWei,
  isYourTurn,
  canShow,
  pending,
  onSee,
  onPack,
  onBet,
  onShow,
}) {
  const [multiplier, setMultiplier] = useState(1);

  useEffect(() => {
    if (isYourTurn) setMultiplier(1);
  }, [isYourTurn, owedWei]);

  const betWei = owedWei * BigInt(multiplier);
  const busy = Boolean(pending);
  const locked = !isYourTurn || busy;

  return (
    <div className={`actionbar ${isYourTurn ? 'is-active' : ''}`}>
      <div className="actionbar__inner">
        <div className="actionbar__owe">
          <p className="eyebrow">You owe</p>
          <p className="actionbar__owe-amount">{ethLabel(owedWei)}</p>
          <p className="muted">{you.seen ? 'seen — double stake' : 'blind — single stake'}</p>
        </div>

        <div className="actionbar__buttons">
          {!you.seen && (
            <Button variant="ghost" onClick={onSee} disabled={locked}>
              See cards <span className="actionbar__free">free</span>
            </Button>
          )}

          <Button variant="danger" onClick={onPack} disabled={locked}>
            Pack <span className="actionbar__free">free</span>
          </Button>

          <Button onClick={() => onBet(betWei)} disabled={locked}>
            {multiplier === 1 ? 'Chaal' : `Raise ×${multiplier}`} {ethLabel(betWei)}
          </Button>

          {canShow && (
            <Button variant="blue" onClick={() => onShow(owedWei)} disabled={locked}>
              Show {ethLabel(owedWei)}
            </Button>
          )}
        </div>

        <div className="actionbar__raise">
          <p className="eyebrow">Raise</p>
          <div className="stepper">
            {Array.from({ length: MAX_MULTIPLIER }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                className={`stepper__btn ${multiplier === n ? 'is-active' : ''}`}
                onClick={() => setMultiplier(n)}
                disabled={locked}
                title={n === 1 ? 'Call the stake' : `Bet ${n} times what you owe`}
              >
                ×{n}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="actionbar__note">
        {isYourTurn
          ? 'Chaal, Raise and Show each send ETH to the contract — your wallet will ask you to confirm. Seeing your cards and packing are free.'
          : 'Waiting for your turn…'}
      </p>
    </div>
  );
}
