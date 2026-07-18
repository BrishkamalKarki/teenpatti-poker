import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoom } from '../../hooks/useRoom.js';
import { walletService } from '../../services/walletService.js';
import Button from '../common/Button.jsx';
import './LobbyForms.css';

export default function CreateRoomForm() {
  const { createRoom } = useRoom();
  const navigate = useNavigate();
  const [hostName, setHostName] = useState('');
  const [maxSeats, setMaxSeats] = useState(6);
  const [bootAmountEth, setBootAmountEth] = useState('0.01');
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState(null); // null | 'chain' | 'room'
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!hostName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      // 1. Pay the boot on-chain — this is a real MetaMask transaction on Anvil.
      //    TeenPattiRoom.sol seats the host automatically and returns a roomId.
      setStep('chain');
      const { roomId } = await walletService.createRoomOnChain({
        maxPlayers: maxSeats,
        bootAmountEth,
      });

      // 2. Open the matching socket room using that same id as the room code,
      //    so everyone shares one code for both the game state and the contract.
      setStep('room');
      const code = await createRoom({
        hostName: hostName.trim(),
        maxSeats,
        buyIn: Number(bootAmountEth),
        roomCode: roomId ?? undefined,
      });
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
      <h3>Create Room</h3>
      <label className="lobby-form__field">
        <span>Your Name</span>
        <input
          value={hostName}
          onChange={(e) => setHostName(e.target.value)}
          placeholder="e.g. Karan"
          maxLength={16}
          required
        />
      </label>

      <div className="lobby-form__row">
        <label className="lobby-form__field">
          <span>Number of Players</span>
          <select value={maxSeats} onChange={(e) => setMaxSeats(Number(e.target.value))}>
            {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
              <option key={n} value={n}>
                {n} players
              </option>
            ))}
          </select>
        </label>

        <label className="lobby-form__field">
          <span>Boot Amount (ETH)</span>
          <select value={bootAmountEth} onChange={(e) => setBootAmountEth(e.target.value)}>
            {['0.001', '0.005', '0.01', '0.05', '0.1'].map((n) => (
              <option key={n} value={n}>
                {n} ETH
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <p className="lobby-form__error">{error}</p>}

      <Button type="submit" full disabled={submitting}>
        {step === 'chain' ? 'Sending boot (sign in wallet)…' : step === 'room' ? 'Opening room…' : 'Create Room'}
      </Button>
      <p className="lobby-form__hint">
        The boot amount is sent immediately as a real transaction on Anvil — connect your wallet first.
      </p>
    </form>
  );
}
