import { Routes, Route } from 'react-router-dom';
import Lobby from './pages/Lobby.jsx';
import Room from './pages/Room.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Lobby />} />
      <Route path="/room/:roomCode" element={<Room />} />
    </Routes>
  );
}
