// The parts around the game: wordmark and tagline, legend, footer row.

import { h } from './dom.js';

// "Spellar", with a red t over the p so a second look reads "Stellar" (docs/screens/wordmark-a.png).
export function createHeader() {
  return h(
    'header',
    { class: 'sp-head' },
    h(
      'h1',
      { class: 'sp-mark', 'aria-label': 'SEDS Spellar' },
      h('span', { class: 'sp-seds', 'aria-hidden': 'true' }, 'SEDS'),
      h('span', { class: 'sp-word', 'aria-hidden': 'true' }, 'S', h('span', { class: 'sp-p' }, 'p', h('span', { class: 'sp-t' }, 't')), 'ellar'),
    ),
    h('p', { class: 'sp-tagline' }, 'includes ships, space related stuff, astronomy, and more!'),
  );
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
