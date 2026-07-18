/**
 * socketService.js — the ONLY file in the frontend that knows about real-time transport.
 *
 * Talks to the real backend (backend/src/server.js) over socket.io-client.
 * Event contract lives in backend/src/sockets/roomHandlers.js — keep both in sync.
 *
 *   createRoom({ hostName, maxSeats, buyIn })       -> Promise<{ roomCode, playerId, state }>
 *   joinRoom({ roomCode, playerName, buyIn })       -> Promise<{ playerId, state }>
 *   leaveRoom({ roomCode, playerId })               -> Promise<void>
 *   startHand({ roomCode })                         -> Promise<{ state }>
 *   sendAction({ roomCode, playerId, type, amount })-> Promise<{ state }>
 *   subscribe(roomCode, callback)                   -> unsubscribe()   // callback(state)
 *   getRoomState(roomCode)                          -> Promise<state|null>
 */
import { io } from 'socket.io-client';

// Set VITE_SOCKET_URL in a .env file (or your host's env config) to point at the
// deployed backend, e.g. https://teenpatti.name.com.np
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:4000';

let socket = null;

function getSocket() {
  if (!socket) {
    socket = io(SOCKET_URL, { autoConnect: true, transports: ['websocket', 'polling'] });
  }
  return socket;
}

function emitWithAck(event, payload, timeoutMs = 8000) {
  return new Promise((resolve, reject) => {
    const s = getSocket();
    const timer = setTimeout(() => {
      reject(new Error('Server did not respond — check that the backend is running and reachable.'));
    }, timeoutMs);

    s.emit(event, payload, (ack) => {
      clearTimeout(timer);
      if (!ack) return reject(new Error('No response from server'));
      if (ack.ok === false) return reject(new Error(ack.error || 'Request failed'));
      resolve(ack);
    });
  });
}

export const socketService = {
  async createRoom({ hostName, maxSeats = 6, buyIn = 1000, roomCode }) {
    const ack = await emitWithAck('room:create', { hostName, maxSeats, buyIn, roomCode });
    return { roomCode: ack.roomCode, playerId: ack.playerId, state: ack.state };
  },

  async joinRoom({ roomCode, playerName, buyIn }) {
    const ack = await emitWithAck('room:join', { roomCode, playerName, buyIn });
    return { playerId: ack.playerId, state: ack.state };
  },

  async leaveRoom({ roomCode, playerId }) {
    getSocket().emit('room:leave', { roomCode, playerId });
  },

  /** Deals a new hand: hole cards, blinds, first turn. Requires >= 2 seated players. */
  async startHand({ roomCode }) {
    const ack = await emitWithAck('room:startHand', { roomCode });
    return { state: ack.state };
  },

  async sendAction({ roomCode, playerId, type, amount = 0 }) {
    const ack = await emitWithAck('room:action', { roomCode, playerId, type, amount });
    return { state: ack.state };
  },

  /** Subscribe to live updates for a room. Returns an unsubscribe function. */
  subscribe(roomCode, callback) {
    const s = getSocket();
    const handler = (state) => {
      if (state?.roomCode === roomCode) callback(state);
    };
    s.on('room:state', handler);
    s.emit('room:subscribe', { roomCode });

    return () => {
      s.off('room:state', handler);
    };
  },

  async getRoomState(roomCode) {
    return new Promise((resolve) => {
      const s = getSocket();
      const timeout = setTimeout(() => {
        s.off('room:state', handler);
        resolve(null);
      }, 4000);
      function handler(state) {
        if (state?.roomCode === roomCode) {
          clearTimeout(timeout);
          s.off('room:state', handler);
          resolve(state);
        }
      }
      s.on('room:state', handler);
      s.emit('room:subscribe', { roomCode });
    });
  },
};
