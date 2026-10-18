// The results: stats numbers, guess distribution, and the end-of-game block
// (answer label, fact, stats, share button, countdown).

import { h, srOnly } from './dom.js';
import { currentStreak, winPercent } from '../stats.js';

function number(value, label) {
  return h('div', { class: 'sp-num' }, h('span', { class: 'sp-num-v' }, String(value)), h('span', { class: 'sp-num-k' }, label));
}

// today: { guesses, won } for the finished puzzle, so its bar can be marked; null otherwise.
export function createStats(stats, { todayNumber, maxGuesses, today }) {
  const rowsShown = maxGuesses === 7 || stats.dist[6] > 0 ? 7 : 6;
  const most = Math.max(1, ...stats.dist.slice(0, rowsShown));
  const bars = [];
  for (let i = 0; i < rowsShown; i++) {
    const count = stats.dist[i];
    const mine = today && today.won && today.guesses === i + 1;
    bars.push(
      h(
        'li',
        { class: `sp-bar-row${mine ? ' is-today' : ''}` },
        h('span', { class: 'sp-bar-n', 'aria-hidden': 'true' }, String(i + 1)),
        h(
          'span',
          { class: 'sp-bar-track', 'aria-hidden': 'true' },
          h('span', { class: 'sp-bar', style: `width:${Math.max(count / most, 0) * 100}%` }),
          h('span', { class: 'sp-bar-count' }, String(count)),
        ),
        srOnly(`${i + 1} ${i ? 'guesses' : 'guess'}: ${count} ${count === 1 ? 'win' : 'wins'}${mine ? ', including today' : ''}`),
      ),
    );
  }
  return h(
    'div',
    { class: 'sp-stats' },
    h(
      'div',
      { class: 'sp-nums' },
      number(stats.played, 'Played'),
      number(winPercent(stats), 'Win %'),
      number(currentStreak(stats, todayNumber), 'Streak'),
      number(stats.maxStreak, 'Max streak'),
    ),
    h('p', { class: 'sp-dist-title' }, 'Guesses'),
    h('ol', { class: 'sp-dist' }, bars),
  );
}

export function createEnd({ answer, fact, won }) {
  const label = h('p', { class: 'sp-answer' }, srOnly(won ? 'Solved: ' : 'The answer was '), h('span', { class: 'sp-answer-word' }, answer));
  const factEl = h('p', { class: 'sp-fact' }, fact);
  const results = h('div', { class: 'sp-results' });
  return { label, fact: factEl, results, el: h('section', { class: 'sp-end', 'aria-label': 'Result' }, label, factEl, results) };
}

export function createShareRow({ onShare, countdownText }) {
  const next = h('p', { class: 'sp-next' }, countdownText);
  const el = h('div', { class: 'sp-share-row' }, h('button', { type: 'button', class: 'sp-share', onclick: onShare }, 'Share'), next);
  return { el, next };
}
