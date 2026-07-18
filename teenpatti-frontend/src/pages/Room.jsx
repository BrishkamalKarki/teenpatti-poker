import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRoom } from '../hooks/useRoom.js';
import { walletService } from '../services/walletService.js';
import RoomHeader from '../components/room/RoomHeader.jsx';
import TeenPattiTable from '../components/room/TeenPattiTable.jsx';
import PlayerPanel from '../components/room/PlayerPanel.jsx';
import TurnBanner from '../components/room/TurnBanner.jsx';
import ActionBar from '../components/room/ActionBar.jsx';
import Button from '../components/common/Button.jsx';
import './Room.css';

const BETWEEN_ROUND_PHASES = ['waiting', 'roundComplete'];

/**
 * NOTE on units: throughout this app, `chips` / `bootAmount` / `stake` are plain
 * numbers that represent ETH directly (e.g. 0.01 = 0.01 ETH), not wei and not an
 * abstract chip count. This keeps teenPattiEngine.js (which only does plain JS
 * math) and TeenPattiRoom.sol (which wants ETH amounts) trivially in sync — no
 * conversion layer needed. See walletService.js for where these get parseEther'd.
 */
export default function Room() {
  const { roomCode: urlRoomCode } = useParams();
  const navigate = useNavigate();
  const {
    roomCode,
    playerId,
    roomState,
    sendAction,
    startHand,
    leaveRoom,
    rejoinFromUrl,
    error: engineError,
  } = useRoom();
  const [checkingRoom, setCheckingRoom] = useState(true);
  const [chainError, setChainError] = useState(null);
  const [txPending, setTxPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function ensureRoom() {
      if (!roomState || roomCode !== urlRoomCode) {
        const found = await rejoinFromUrl(urlRoomCode);
        if (!cancelled && !found) {
          navigate('/');
          return;
        }
      }
      if (!cancelled) setCheckingRoom(false);
    }
    ensureRoom();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlRoomCode]);

  if (checkingRoom || !roomState) {
    return (
      <div className="room room--loading">
        <p className="eyebrow">Finding your seat…</p>
      </div>
    );
  }

  const you = roomState.seats.find((s) => s && s.playerId === playerId);
  const seatCount = roomState.seats.filter(Boolean).length;
  const yourIndex = roomState.seats.findIndex((s) => s && s.playerId === playerId);
  const isYourTurn = yourIndex !== -1 && yourIndex === roomState.currentTurnIndex;
  const isPlayingPhase = roomState.phase === 'playing';
  const canStartRound = BETWEEN_ROUND_PHASES.includes(roomState.phase) && seatCount >= 2;
  const isHost = you?.isHost;

  const activeSeats = roomState.seats.filter((s) => s && !s.packed);
  const canShow = isPlayingPhase && activeSeats.length === 2;

  const turnSeat = roomState.seats[roomState.currentTurnIndex];

  const winnerText =
    roomState.phase === 'roundComplete' && roomState.winners
      ? `${roomState.winners.map((w) => w.name).join(' and ')} won — ${roomState.winners[0].label}`
      : null;

  const dealMessage =
    roomState.phase === 'waiting'
      ? `Waiting for players — share room code ${roomState.roomCode}${seatCount < 2 ? ' (need at least 2 players)' : ''}`
      : null;

  /**
   * Every bet/show/pack the off-chain engine accepts also has to move real ETH
   * on-chain. We fire the socket action (authoritative game state) and the
   * on-chain transaction in parallel — the socket call is instant, the chain
   * call brings up MetaMask and takes a block to confirm. Actions that don't
   * move money (seeCards, pack) skip the chain entirely.
   */
  async function handleAction(type, amount) {
    setChainError(null);
    try {
      await sendAction(type, amount);
    } catch (e) {
      // sendAction already surfaces engine errors via `engineError`
      return;
    }

    if (type === 'bet' || type === 'show') {
      setTxPending(true);
      try {
        await walletService.placeBetOnChain({ roomId: roomCode, amountEth: amount });
      } catch (e) {
        setChainError(e.message || 'On-chain transaction failed');
      } finally {
        setTxPending(false);
      }
    }
  }

  /** Host-only: reports the just-finished round's winners to the contract for payout. */
  async function handleSettleOnChain() {
    if (!isHost || !roomState.winners) return;
    setChainError(null);
    setTxPending(true);
    try {
      await walletService.settleRoundOnChain({
        roomId: roomCode,
        winnerAddresses: roomState.winners.map((w) => w.playerId),
        amountsEth: roomState.winners.map((w) => w.amount),
      });
    } catch (e) {
      setChainError(e.message || 'Settlement transaction failed');
    } finally {
      setTxPending(false);
    }
  }

  return (
    <div className="room">
      <RoomHeader
        roomCode={roomState.roomCode}
        seatCount={seatCount}
        maxSeats={roomState.maxSeats}
        onLeave={leaveRoom}
      />

      <div className="turn-banner-wrap">
        <TurnBanner
          isYourTurn={isYourTurn}
          waitingOnName={isPlayingPhase ? turnSeat?.name : null}
          winnerText={winnerText}
          dealMessage={dealMessage}
        />
      </div>

      <div className="room__table-area">
        <div className="room__table-spacer" aria-hidden="true" />
        <TeenPattiTable roomState={roomState} playerId={playerId} />
        <PlayerPanel
          seats={roomState.seats}
          playerId={playerId}
          currentTurnIndex={roomState.currentTurnIndex}
          dealerIndex={roomState.dealerIndex}
        />
      </div>

      <div className="room__status">
        {engineError && <p className="room__error">{engineError}</p>}
        {chainError && <p className="room__error">Chain error: {chainError}</p>}
        {txPending && <p className="eyebrow">Confirming transaction…</p>}

        {canStartRound && isHost && (
          <div className="room__start-wrap">
            <Button onClick={startHand} disabled={seatCount < 2}>
              {roomState.phase === 'waiting' ? 'Start Round' : 'Next Round'}
            </Button>
          </div>
        )}
        {canStartRound && !isHost && (
          <p className="room__start-wrap eyebrow">Waiting for the host to start the next round…</p>
        )}

        {roomState.phase === 'roundComplete' && isHost && (
          <div className="room__start-wrap">
            <Button variant="secondary" onClick={handleSettleOnChain} disabled={txPending}>
              Confirm payout on-chain (Settle)
            </Button>
          </div>
        )}
      </div>

      {you && isPlayingPhase && (
        <ActionBar
          chips={you.chips}
          stake={roomState.stake}
          hasSeen={you.seen}
          canShow={canShow}
          disabled={you.packed || !isYourTurn || txPending}
          onAction={handleAction}
        />
      )}
    </div>
  );
}
