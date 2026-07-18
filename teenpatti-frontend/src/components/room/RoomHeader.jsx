import { useNavigate } from 'react-router-dom';
import Logo from '../common/Logo.jsx';
import Button from '../common/Button.jsx';
import './RoomHeader.css';

export default function RoomHeader({ roomCode, seatCount, maxSeats, onLeave }) {
  const navigate = useNavigate();

  function handleLeave() {
    onLeave();
    navigate('/');
  }

  return (
    <header className="room-header">
      <Logo size="sm" />
      <div className="room-header__info">
        <span className="eyebrow">Room</span>
        <span className="room-header__code">{roomCode}</span>
        <span className="room-header__seats">
          {seatCount}/{maxSeats} seated
        </span>
      </div>
      <div className="room-header__actions">
        <Button variant="secondary" size="sm" onClick={handleLeave}>
          Leave Table
        </Button>
      </div>
    </header>
  );
}