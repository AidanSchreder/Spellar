import { test, expect } from '@playwright/test';
import { emptyStats, notePlayed, recordGame, currentStreak, winPercent } from '../../src/stats.js';
import { shareText, LOSS_MARK } from '../../src/share.js';
import { starsFor, segmentsFor } from '../../src/constellation.js';
import { addDays, daysBetween, formatCountdown, localDate, msUntilMidnight } from '../../src/dates.js';
import { decode as clientDecode } from '../../src/codec.js';
import { encode, decode } from '../../bin/lib/puzzle.mjs';
import { createStore, KEY } from '../../src/store.js';

const C = 'correct', P = 'present', A = 'absent';

test.describe('stats and streaks', () => {
  test('wins in a row build a streak; a loss ends it', () => {
    const s = emptyStats();
    recordGame(s, { number: 1, won: true, guesses: 3, length: 5, stars: [] });
    recordGame(s, { number: 2, won: true, guesses: 4, length: 5, stars: [] });
    expect(s).toMatchObject({ played: 2, wins: 2, streak: 2, maxStreak: 2, lastWon: 2 });
    expect(s.dist.slice(0, 5)).toEqual([0, 0, 1, 1, 0]);
    recordGame(s, { number: 3, won: false, guesses: 6, length: 5, stars: [] });
    expect(s).toMatchObject({ played: 3, wins: 2, streak: 0, maxStreak: 2 });
    expect(winPercent(s)).toBe(67);
  });

  test('a missed day restarts the streak at 1 and shows 0 until then', () => {
    const s = emptyStats();
    recordGame(s, { number: 5, won: true, guesses: 2, length: 4, stars: [] });
    expect(currentStreak(s, 6)).toBe(1); // yesterday's win still counts
    expect(currentStreak(s, 7)).toBe(0); // a day was missed
    recordGame(s, { number: 7, won: true, guesses: 2, length: 4, stars: [] });
    expect(s.streak).toBe(1);
  });

  test('the same puzzle is never counted twice', () => {
    const s = emptyStats();
    recordGame(s, { number: 9, won: true, guesses: 1, length: 4, stars: [] });
    recordGame(s, { number: 9, won: true, guesses: 1, length: 4, stars: [] });
    expect(s.played).toBe(1);
  });

  test('a 7-guess win goes in the seventh bucket', () => {
    const s = emptyStats();
    recordGame(s, { number: 1, won: true, guesses: 7, length: 7, stars: [] });
    expect(s.dist[6]).toBe(1);
  });

  test('start flags: returning after yesterday, veteran after 7 days', () => {
    const s = emptyStats();
    expect(notePlayed(s, '2026-11-01', '2026-10-31')).toEqual({ returningD1: false, veteran: false });
    expect(notePlayed(s, '2026-11-02', '2026-11-01')).toEqual({ returningD1: true, veteran: false });
    expect(notePlayed(s, '2026-11-04', '2026-11-03')).toEqual({ returningD1: false, veteran: false });
    expect(notePlayed(s, '2026-11-08', '2026-11-07')).toEqual({ returningD1: false, veteran: true });
    expect(s.firstPlayed).toBe('2026-11-01');
  });

  test('only the last 30 played dates and constellations are kept', () => {
    const s = emptyStats();
    for (let i = 0; i < 40; i++) {
      const d = addDays('2026-01-01', i);
      notePlayed(s, d, addDays(d, -1));
      recordGame(s, { number: i + 1, won: true, guesses: 3, length: 5, stars: [{ col: 0, row: 1, solved: true }] });
    }
    expect(s.dates.length).toBe(30);
    expect(s.dates[0]).toBe('2026-01-11');
    expect(s.sky.length).toBe(30);
    expect(s.sky[29]).toEqual({ n: 40, len: 5, won: true, stars: [[0, 1, 1]] });
  });
});

test.describe('share text', () => {
  test('one star character per letter, never the answer', () => {
    const text = shareText({
      number: 12,
      maxGuesses: 6,
      won: true,
      rows: [[C, P, A, A, A], [C, C, A, A, C], [C, C, A, C, C], [C, C, C, C, C]],
    });
    expect(text).toBe('Spellar #12 4/6\n★✦☆☆☆\n★★☆☆★\n★★☆★★\n★★★★★\nseds.ca/spellar');
  });

  test('a loss scores ✕', () => {
    const rows = Array.from({ length: 7 }, () => [A, A, A, A, A, A, A]);
    const text = shareText({ number: 3, maxGuesses: 7, won: false, rows });
    expect(text.split('\n')[0]).toBe(`Spellar #3 ${LOSS_MARK}/7`);
    expect(LOSS_MARK).toBe('✕');
  });

  test('uses only characters that have no emoji presentation', () => {
    // Emoji_Presentation characters would render as pictures on phones.
    for (const ch of ['★', '✦', '☆', '✕']) expect(/\p{Emoji_Presentation}/u.test(ch)).toBe(false);
  });
});

test.describe('constellation', () => {
  test('a star sits on the first row each position was correct', () => {
    const results = [
      [A, C, A, A, P],
      [C, C, A, P, A],
      [C, C, C, C, C],
    ];
    expect(starsFor(results, 5)).toEqual([
      { col: 0, row: 1, solved: true },
      { col: 1, row: 0, solved: true },
      { col: 2, row: 2, solved: true },
      { col: 3, row: 2, solved: true },
      { col: 4, row: 2, solved: true },
    ]);
  });

  test('on a loss, unsolved positions get rings on the last row and the line skips them', () => {
    const results = [
      [C, A, A, A],
      [C, C, A, P],
    ];
    const stars = starsFor(results, 4);
    expect(stars.map((s) => s.solved)).toEqual([true, true, false, false]);
    expect(stars[2]).toEqual({ col: 2, row: 1, solved: false });
    expect(segmentsFor(stars)).toEqual([[0, 1]]);
    const gap = [{ solved: true }, { solved: false }, { solved: true }, { solved: true }];
    expect(segmentsFor(gap)).toEqual([[2, 3]]); // no line from 1 to 3 across the ring
  });

  test('a win joins every position in letter order', () => {
    const stars = starsFor([[C, C, C, C, C, C]], 6);
    expect(segmentsFor(stars)).toEqual([[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]]);
  });
});

test.describe('dates', () => {
  test('arithmetic on calendar dates', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
    expect(daysBetween('2026-10-17', '2027-10-17')).toBe(365);
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  test('countdown text', () => {
    expect(formatCountdown(5 * 3600000 + 12 * 60000)).toBe('5h 12m');
    expect(formatCountdown(59 * 60000 + 1)).toBe('1h 0m');
    expect(formatCountdown(30 * 1000)).toBe('1m');
    const almostMidnight = new Date(2026, 5, 1, 23, 58, 0);
    expect(msUntilMidnight(almostMidnight)).toBe(120000);
  });
});

test.describe('spoiler shield', () => {
  test('the client decodes what the server encodes, including non-ASCII facts', () => {
    const fact = 'Mercury swings from about 430 °C by day to about −180 °C — Boötes, Kármán.';
    for (const date of ['2026-10-17', '2027-02-28']) {
      const enc = encode(fact, date);
      expect(enc).not.toContain('Mercury');
      expect(decode(enc, date)).toBe(fact);
      expect(clientDecode(enc, date)).toBe(fact);
    }
    expect(clientDecode(encode('SPUTNIK', '2026-10-04'), '2026-10-04')).toBe('SPUTNIK');
  });
});

test.describe('storage', () => {
  const memory = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
  };

  test('saves under one versioned key and reloads', () => {
    const backend = memory();
    const a = createStore(backend);
    a.update((s) => (s.game = { number: 4, date: '2026-10-20', guesses: ['ORBIT'], status: 'playing' }));
    expect([...backend.m.keys()]).toEqual([KEY]);
    expect(KEY).toBe('spellar:v1');
    const b = createStore(backend);
    expect(b.get().game.guesses).toEqual(['ORBIT']);
  });

  test('works without storage, and survives storage that throws', () => {
    const none = createStore(null);
    none.update((s) => (s.stats.played = 3));
    expect(none.get().stats.played).toBe(3);
    expect(none.persistent).toBe(false);
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); } };
    const s = createStore(broken);
    s.update((st) => (st.stats.wins = 1));
    expect(s.get().stats.wins).toBe(1);
  });

  test('ignores corrupt saved data', () => {
    const backend = memory();
    backend.setItem(KEY, '{not json');
    expect(createStore(backend).get().stats.played).toBe(0);
  });
});
