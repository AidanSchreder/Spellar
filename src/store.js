// All of a player's saved state lives behind this one module, under one versioned
// localStorage key. If storage is unavailable (private mode, blocked site data) the game still
// works; it just forgets everything on reload. A later version can swap the backend here, for
// example to WordPress user meta for logged-in members, without touching the game.

import { emptyStats } from './stats.js';

export const KEY = 'spellar:v1';

export function emptyState() {
  return {
    v: 1,
    puzzle: null, // today's puzzle as the server sent it (answer and fact still encoded)
    game: null, // { number, date, guesses: [], status: 'playing' | 'won' | 'lost' }
    stats: emptyStats(),
    sent: { start: null, finish: null, share: null, french: null }, // local date each event last went out
  };
}

function browserStorage() {
  try {
    const s = window.localStorage;
    const probe = 'spellar:probe';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function createStore(backend = browserStorage()) {
  let state = emptyState();
  if (backend) {
    try {
      const saved = JSON.parse(backend.getItem(KEY));
      if (saved && saved.v === 1) {
        state = { ...emptyState(), ...saved };
        state.stats = { ...emptyState().stats, ...saved.stats };
        state.sent = { ...emptyState().sent, ...saved.sent };
      }
    } catch {
      /* unreadable: start fresh */
    }
  }
  return {
    persistent: Boolean(backend),
    get: () => state,
    update(change) {
      change(state);
      if (!backend) return;
      try {
        backend.setItem(KEY, JSON.stringify(state));
      } catch {
        /* full or blocked: keep playing from memory */
      }
    },
  };
}
