import PlayerSeat from './PlayerSeat.jsx';
import ChipStack from '../common/ChipStack.jsx';
import { getSeatPositions, rotateForViewer } from '../../utils/seatPositions.js';
import './TeenPattiTable.css';

/**
 * Teen Patti has no community cards — the felt only ever shows the pot and
 * (once a hand ends) the current stake, which is where poker's CommunityCards
 * component used to sit.
 */
export default function TeenPattiTable({ roomState, playerId }) {
  const { seats, pot, stake, dealerIndex, currentTurnIndex, phase, winners } = roomState;
  const positions = getSeatPositions(seats.length);
  const viewerIndex = seats.findIndex((s) => s && s.playerId === playerId);
  const ordered = rotateForViewer(seats, viewerIndex === -1 ? 0 : viewerIndex);
  const revealAll = phase === 'roundComplete' && Array.isArray(winners);

  return (
    <div className="teenpatti-table-wrap">
      <div className="teenpatti-table">
        <div className="teenpatti-table__rail">
          <div className="teenpatti-table__felt">
            <div className="pot-display">
              {pot > 0 && (
                <>
                  <span className="eyebrow">Pot</span>
                  <ChipStack total={pot} size="md" />
                </>
              )}
              {phase === 'playing' && (
                <span className="pot-display__stake">Chaal: {stake?.toLocaleString()}</span>
              )}
            </div>
          </div>
        </div>
        {ordered.map(({ seat, originalIndex }, displayIndex) => {
          const winnerEntry = winners?.find((w) => seat && w.playerId === seat.playerId);
          return (
            <PlayerSeat
              key={originalIndex}
              seat={seat}
              isYou={seat && seat.playerId === playerId}
              isDealer={originalIndex === dealerIndex}
              isTurn={originalIndex === currentTurnIndex}
              revealAll={revealAll}
              winnerLabel={winnerEntry?.label}
              position={positions[displayIndex]}
            />
          );
        })}
      </div>
    </div>
  );
}
