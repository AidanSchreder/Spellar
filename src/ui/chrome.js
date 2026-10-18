// The parts around the game: wordmark and tagline, legend, footer row.

import { h } from './dom.js';

// "Spellar". The p and a hidden t share one slot: now and then the p fades into the t for a moment,
// so the word shows its other side, "Stellar" (motion.js, titleSwaps).
export function createHeader() {
  const p = h('span', { class: 'sp-p' }, 'p');
  const t = h('span', { class: 'sp-t' }, 't');
  const slot = h('span', { class: 'sp-pt' }, p, t);
  const el = h(
    'header',
    { class: 'sp-head' },
    h(
      'h1',
      { class: 'sp-mark', 'aria-label': 'SEDS Spellar' },
      h('span', { class: 'sp-seds', 'aria-hidden': 'true' }, 'SEDS'),
      h('span', { class: 'sp-word', 'aria-hidden': 'true' }, 'S', slot, 'ellar'),
    ),
    h('p', { class: 'sp-tagline' }, 'includes ships, space related stuff, astronomy, and more!'),
  );
  return { el, title: { slot, p, t } };
}

export function swatch(state) {
  return h('span', { class: 'sp-swatch', 'data-state': state, 'aria-hidden': 'true' });
}

export function createLegend() {
  return h(
    'p',
    { class: 'sp-legend' },
    h('span', { class: 'sp-legend-item' }, swatch('correct'), 'Right spot'),
    h('span', { class: 'sp-legend-sep', 'aria-hidden': 'true' }, '·'),
    h('span', { class: 'sp-legend-item' }, swatch('present'), 'Wrong spot'),
    h('span', { class: 'sp-legend-sep', 'aria-hidden': 'true' }, '·'),
    h('span', { class: 'sp-legend-item' }, swatch('absent'), 'Not in word'),
  );
}

export function createFooter({ onHelp, onStats, onFrench }) {
  return h(
    'nav',
    { class: 'sp-foot', 'aria-label': 'Spellar' },
    h('button', { type: 'button', class: 'sp-link', onclick: onHelp }, 'How to play'),
    h('button', { type: 'button', class: 'sp-link', onclick: onStats }, 'Stats'),
    h('button', { type: 'button', class: 'sp-link', lang: 'fr', onclick: onFrench }, 'Français'),
  );
}
