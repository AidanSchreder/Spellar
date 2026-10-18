// Dates are the player's local calendar date as "YYYY-MM-DD": each player's puzzle changes at
// their own midnight. Arithmetic on those strings is done in UTC so no time zone shifts a day.

const pad = (n) => (n < 10 ? '0' : '') + n;

export function localDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toMs(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(date, n) {
  return new Date(toMs(date) + n * 86400000).toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((toMs(to) - toMs(from)) / 86400000);
}

export function msUntilMidnight(now = new Date()) {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next - now;
}

// "5h 12m", rounding up so it never says 0m while time is left.
export function formatCountdown(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}
