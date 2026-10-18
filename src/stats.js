// Player statistics, kept in the browser. Streaks count consecutive puzzle numbers, and a
// puzzle number is one local calendar day, so a missed day ends the streak.

import { daysBetween } from './dates.js';

export const KEEP = 30; // played dates and finished constellations kept

export function emptyStats() {
  return {
    played: 0,
    wins: 0,
    streak: 0,
    maxStreak: 0,
    dist: [0, 0, 0, 0, 0, 0, 0], // wins in 1..7 guesses
    lastNumber: null, // last finished puzzle
    lastWon: null, // last won puzzle
    firstPlayed: null, // local date of the first guess ever
    dates: [], // local dates with a guess, newest last
    sky: [], // finished games' stars, for a later "your sky" view: { n, len, won, stars: [[col, row, solved]] }
  };
}

// Called when the first guess of a day is made. Returns the two flags the "start" event reports,
// worked out before today is added.
export function notePlayed(stats, today, yesterday) {
  const returningD1 = stats.dates.includes(yesterday);
  const veteran = stats.firstPlayed !== null && daysBetween(stats.firstPlayed, today) >= 7;
  if (!stats.firstPlayed) stats.firstPlayed = today;
  if (!stats.dates.includes(today)) stats.dates.push(today);
  if (stats.dates.length > KEEP) stats.dates.splice(0, stats.dates.length - KEEP);
  return { returningD1, veteran };
}

export function recordGame(stats, { number, won, guesses, length, stars }) {
  if (stats.lastNumber === number) return stats; // already counted (e.g. a second tab)
  stats.played++;
  stats.lastNumber = number;
  if (won) {
    stats.wins++;
    stats.dist[guesses - 1]++;
    stats.streak = stats.lastWon === number - 1 ? stats.streak + 1 : 1;
    stats.maxStreak = Math.max(stats.maxStreak, stats.streak);
    stats.lastWon = number;
  } else {
    stats.streak = 0;
  }
  stats.sky.push({ n: number, len: length, won, stars: stars.map((s) => [s.col, s.row, s.solved ? 1 : 0]) });
  if (stats.sky.length > KEEP) stats.sky.splice(0, stats.sky.length - KEEP);
  return stats;
}

// The streak still counts if the last win was today's puzzle or yesterday's.
export function currentStreak(stats, todayNumber) {
  return stats.lastWon !== null && stats.lastWon >= todayNumber - 1 ? stats.streak : 0;
}

export function winPercent(stats) {
  return stats.played ? Math.round((100 * stats.wins) / stats.played) : 0;
}
