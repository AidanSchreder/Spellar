// Talking to the plugin's REST routes. No cookies are sent or set (credentials: 'omit').

export async function fetchPuzzle(api, date) {
  const res = await fetch(`${api}puzzle?date=${encodeURIComponent(date)}`, { credentials: 'omit' });
  if (!res.ok) throw new Error(`puzzle ${res.status}`);
  return res.json();
}

// Fire and forget: analytics must never get in the way of playing.
export function postEvent(api, event) {
  try {
    fetch(`${api}event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      credentials: 'omit',
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* no fetch, or blocked */
  }
}

let dictionary = null;
export function loadDictionary(url) {
  if (!dictionary) {
    dictionary = fetch(url, { credentials: 'omit' })
      .then((res) => {
        if (!res.ok) throw new Error(`guesses ${res.status}`);
        return res.text();
      })
      .then((text) => new Set(text.split('\n').map((w) => w.trim()).filter(Boolean)))
      .catch((err) => {
        dictionary = null; // try again on the next guess
        throw err;
      });
  }
  return dictionary;
}
