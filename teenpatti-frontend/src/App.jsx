import { Navigate, Route, Routes } from 'react-router-dom';
import Lobby from './pages/Lobby.jsx';
import Room from './pages/Room.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/room/:roomCode" element={<Room />} />
      {/* Any unknown URL (an expired room link, a typo) goes back to the lobby
          rather than showing a blank page. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
