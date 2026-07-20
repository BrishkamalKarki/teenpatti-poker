// this talks with the server

import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';

let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, { transports: ['websocket', 'polling'] });
  }
  return socket;
}

function ask(event, payload, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('The game server did not answer. Is it running at ' + SERVER_URL + '?')),
      timeoutMs
    );
    getSocket().emit(event, payload, (ack) => {
      clearTimeout(timer);
      if (!ack) return reject(new Error('No response from the game server'));
      if (ack.ok === false) return reject(new Error(ack.error || 'The server rejected that'));
      resolve(ack);
    });
  });
}

export const server = {
  createRoom: (payload) => ask('room:create', payload),
  lookupRoom: (roomCode) => ask('room:lookup', { roomCode }),
  joinRoom: (payload) => ask('room:join', payload),
  startGame: (payload) => ask('room:start', payload),
  sendAction: (payload) => ask('room:action', payload),
  finishGame: (payload) => ask('room:finish', payload),
  kickPlayer: (payload) => ask('room:kick', payload),
  leaveRoom: (payload) => getSocket().emit('room:leave', payload),

  watchRoom(roomCode, playerId, onState, onGone) {
    const s = getSocket();

    const handleState = (state) => {
      if (state?.roomCode === roomCode) onState(state);
    };
    const handleGone = (payload) => {
      if (payload?.roomCode === roomCode) onGone?.();
    };
    const handleConnect = () => s.emit('room:subscribe', { roomCode, playerId });

    s.on('room:state', handleState);
    s.on('room:gone', handleGone);
    s.on('connect', handleConnect);
    s.emit('room:subscribe', { roomCode, playerId });

    return () => {
      s.off('room:state', handleState);
      s.off('room:gone', handleGone);
      s.off('connect', handleConnect);
    };
  },
};
