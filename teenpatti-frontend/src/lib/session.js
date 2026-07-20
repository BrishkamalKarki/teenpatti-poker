// preserves the states on resfreshing the browser

const KEY = 'teenpatti.session';

export function saveSession({ roomCode, playerId, name }) {
  localStorage.setItem(KEY, JSON.stringify({ roomCode, playerId, name }));
}

export function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || null;
  } catch {
    return null;
  }
}

export function sessionFor(roomCode) {
  const session = loadSession();
  return session && session.roomCode === roomCode ? session : null;
}

export function clearSession() {
  localStorage.removeItem(KEY);
}

export function rememberName(name) {
  localStorage.setItem('teenpatti.name', name);
}

export function recallName() {
  return localStorage.getItem('teenpatti.name') || '';
}
