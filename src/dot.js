// The game's side of the menu dot (assets/menu-dot.js draws it on every page).
// "spellar:dot" = { firstVisit, lastPlayed }, local dates.

const KEY = 'spellar:dot';

function read() {
  try {
    return JSON.parse(window.localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

function write(value) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

// Set when the game page loads, so arriving by a shared link counts as a visit.
export function markVisited(today) {
  const dot = read();
  if (!dot.firstVisit) write({ ...dot, firstVisit: today });
}

// Set when today's puzzle is finished; the dot then hides for the rest of the day.
// (.spellar-dot: the element an earlier version added, still in pages cached before it changed.)
export function markPlayed(today) {
  const dot = read();
  write({ firstVisit: dot.firstVisit || today, lastPlayed: today });
  for (const el of document.querySelectorAll('#spellar-dot-style, .spellar-dot')) el.remove();
}
