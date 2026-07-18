import { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { socketService } from '../services/socketService.js';

export const RoomContext = createContext(null);

export function RoomProvider({ children }) {
  const [roomCode, setRoomCode] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [playerName, setPlayerName] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [error, setError] = useState(null);
  const unsubscribeRef = useRef(null);

  const subscribeToRoom = useCallback((code) => {
    if (unsubscribeRef.current) unsubscribeRef.current();
    unsubscribeRef.current = socketService.subscribe(code, setRoomState);
  }, []);

  const createRoom = useCallback(
    async ({ hostName, maxSeats, buyIn, roomCode: desiredCode }) => {
      setError(null);
      try {
        const { roomCode: code, playerId: id, state } = await socketService.createRoom({
          hostName,
          maxSeats,
          buyIn,
          roomCode: desiredCode, // backend may honor this to match the on-chain roomId; ignored if unsupported
        });
        setRoomCode(code);
        setPlayerId(id);
        setPlayerName(hostName);
        setRoomState(state);
        subscribeToRoom(code);
        return code;
      } catch (e) {
        setError(e.message);
        throw e;
      }
    },
    [subscribeToRoom]
  );

  const joinRoom = useCallback(
    async ({ roomCode: code, playerName: name, buyIn }) => {
      setError(null);
      try {
        const { playerId: id, state } = await socketService.joinRoom({
          roomCode: code,
          playerName: name,
          buyIn,
        });
        setRoomCode(code);
        setPlayerId(id);
        setPlayerName(name);
        setRoomState(state);
        subscribeToRoom(code);
        return true;
      } catch (e) {
        setError(e.message);
        throw e;
      }
    },
    [subscribeToRoom]
  );

  const leaveRoom = useCallback(async () => {
    if (!roomCode || !playerId) return;
    await socketService.leaveRoom({ roomCode, playerId });
    if (unsubscribeRef.current) unsubscribeRef.current();
    setRoomCode(null);
    setPlayerId(null);
    setRoomState(null);
  }, [roomCode, playerId]);

  const sendAction = useCallback(
    async (type, amount) => {
      if (!roomCode || !playerId) return;
      setError(null);
      try {
        await socketService.sendAction({ roomCode, playerId, type, amount });
      } catch (e) {
        setError(e.message);
      }
    },
    [roomCode, playerId]
  );

  const startHand = useCallback(async () => {
    if (!roomCode) return;
    setError(null);
    try {
      await socketService.startHand({ roomCode });
    } catch (e) {
      setError(e.message);
    }
  }, [roomCode]);

  // Rehydrate a room from the URL on refresh, if we already have a saved player identity.
  const rejoinFromUrl = useCallback(
    async (code) => {
      const state = await socketService.getRoomState(code);
      if (!state) return false;
      setRoomCode(code);
      setRoomState(state);
      subscribeToRoom(code);
      return true;
    },
    [subscribeToRoom]
  );

  useEffect(() => {
    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, []);

  const value = {
    roomCode,
    playerId,
    playerName,
    roomState,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    sendAction,
    startHand,
    subscribeToRoom,
    rejoinFromUrl,
    setRoomCode,
    setPlayerId,
    setPlayerName,
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}