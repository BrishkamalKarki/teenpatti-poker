import { useState } from 'react';
import Logo from '../components/common/Logo.jsx';
import WalletButton from '../components/common/WalletButton.jsx';
import CreateRoomForm from '../components/lobby/CreateRoomForm.jsx';
import JoinRoomForm from '../components/lobby/JoinRoomForm.jsx';
import './Lobby.css';

export default function Lobby() {
  const [mode, setMode] = useState('create'); // 'create' | 'join'

  return (
    <div className="lobby">
      <div className="lobby__vignette" />

      <div className="lobby__topbar">
        <WalletButton />
      </div>

      <div className="lobby__content">
        <Logo size="lg" />
        <p className="eyebrow lobby__tagline">Nepali Teen Patti — real ETH stakes on the Anvil blockchain</p>

        <div className="lobby__toggle">
          <button
            className={`lobby__toggle-btn ${mode === 'create' ? 'is-active' : ''}`}
            onClick={() => setMode('create')}
          >
            Create Room
          </button>
          <button
            className={`lobby__toggle-btn ${mode === 'join' ? 'is-active' : ''}`}
            onClick={() => setMode('join')}
          >
            Join Room
          </button>
        </div>

        {mode === 'create' ? <CreateRoomForm /> : <JoinRoomForm />}
      </div>
    </div>
  );
}
