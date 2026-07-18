import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../../hooks/useRoom.js';
import { walletService } from '../../services/walletService.js';
import Button from '../common/Button.jsx';
import './LobbyForms.css';

export default function JoinRoomForm() {
  const { joinRoom } = useRoom();
  const navigate = useNavigate();
  const [playerName, setPlayerName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(null); // null | 'chain' | 'room'
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!playerName.trim() || !roomCode.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const code = roomCode.trim();

      // Look up the room's on-chain boot amount so we pay exactly what the
      // contract expects, then pay it as a real transaction before joining.
      setStep('chain');
      const onChainRoom = await walletService.getRoomOnChain(code);
      await walletService.joinRoomOnChain({ roomId: code, bootAmountEth: onChainRoom.bootAmountEth });

      setStep('room');
      await joinRoom({ roomCode: code, playerName: playerName.trim(), buyIn: Number(onChainRoom.bootAmountEth) });
      navigate(`/room/${code}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
      setStep(null);
    }
  }

  return (
    <form className="lobby-form" onSubmit={handleSubmit}>
      <h3>Join Room</h3>
      <label className="lobby-form__field">
        <span>Your Name</span>
        <input
          value={playerName}
          onChange={(e) => setPlayerName(e.target.value)}
          placeholder="e.g. Karan"
          maxLength={16}
          required
        />
      </label>

      <label className="lobby-form__field">
        <span>Room Code</span>
        <input
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value.trim())}
          placeholder="e.g. 0 (chain roomId)"
          maxLength={12}
          className="lobby-form__code-input"
          required
        />
      </label>

      {error && <p className="lobby-form__error">{error}</p>}

      <Button type="submit" variant="secondary" full disabled={submitting}>
        {step === 'chain' ? 'Sending boot (sign in wallet)…' : step === 'room' ? 'Joining…' : 'Join'}
      </Button>
      <p className="lobby-form__hint">The host's boot amount is detected automatically and sent from your wallet.</p>
    </form>
  );
}
