// arena where the game is played

import { Hand } from '../Card.jsx';
import { Badge } from '../ui.jsx';
import { ethLabel } from '../../lib/format.js';

const LAYOUTS = {
  2: ['bottom', 'top'],
  3: ['bottom', 'left', 'right'],
  4: ['bottom', 'left', 'top', 'right'],
};

export default function Table({ state, playerId }) {
  const seats = state.seats;
  const youIndex = seats.findIndex((s) => s && s.playerId === playerId);

  const start = youIndex === -1 ? 0 : youIndex;
  const ordered = seats.map((_, i) => (start + i) % seats.length);
  const cells = LAYOUTS[seats.length] || LAYOUTS[4];

  const revealed = state.phase === 'finished';

  return (
    <div className="felt">
      <div className="felt__inner">
        {ordered.map((seatIndex, position) => (
          <Seat
            key={seatIndex}
            cell={cells[position]}
            seat={seats[seatIndex]}
            isYou={seatIndex === youIndex}
            isTurn={seatIndex === state.currentTurnIndex && state.phase === 'playing'}
            isDealer={seatIndex === state.dealerIndex}
            revealed={revealed}
            winner={state.winners?.find((w) => w.playerId === seats[seatIndex]?.playerId)}
          />
        ))}

        <div className="pot">
          <p className="eyebrow">Pot</p>
          <p className="pot__amount">{ethLabel(state.potWei)}</p>
          {state.phase === 'playing' && (
            <p className="pot__stake">stake {ethLabel(state.stakeWei)}</p>
          )}
          {state.phase === 'waiting' && <p className="pot__stake">waiting for players</p>}
        </div>
      </div>
    </div>
  );
}

function Seat({ seat, cell, isYou, isTurn, isDealer, revealed, winner }) {
  if (!seat) {
    return (
      <div className={`seat seat--${cell} seat--empty`}>
        <div className="seat__empty-ring">+</div>
        <p className="seat__empty-label">Open seat</p>
      </div>
    );
  }

  const faceDown = revealed ? seat.packed && !isYou : isYou ? !seat.seen : true;

  const classes = ['seat', `seat--${cell}`];
  if (isYou) classes.push('is-you');
  if (isTurn) classes.push('is-turn');
  if (seat.packed) classes.push('is-packed');
  if (winner) classes.push('is-winner');

  return (
    <div className={classes.join(' ')}>
      <Hand cards={seat.cards} faceDown={faceDown} size={isYou ? 'lg' : 'md'} />

      <div className="seat__plate">
        <div className="seat__name-row">
          <span className="seat__name">{seat.name}</span>
          {isDealer && <span className="seat__dealer" title="Dealer">D</span>}
        </div>
        <div className="seat__tags">
          {isYou && <Badge tone="gold">You</Badge>}
          {seat.isHost && <Badge>Host</Badge>}
          {!seat.packed && <Badge tone={seat.seen ? 'blue' : undefined}>{seat.seen ? 'Seen' : 'Blind'}</Badge>}
          {seat.packed && <Badge tone="red">Packed</Badge>}
        </div>
        <p className="seat__staked">in the pot: {ethLabel(seat.stakedWei)}</p>
      </div>

      {winner && <div className="seat__winner">Wins {ethLabel(winner.amountWei)}</div>}
    </div>
  );
}
