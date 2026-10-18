// The board: rows of tiles, plus the SVG layer the constellation is drawn on.

import { h, s } from './dom.js';

export const STATE_LABEL = { correct: 'correct', present: 'wrong spot', absent: 'not in word' };

export function tileLabel(letter, state) {
  if (!letter) return 'empty';
  return STATE_LABEL[state] ? `${letter}, ${STATE_LABEL[state]}` : letter;
}

export function setTile(tile, letter, state) {
  tile.dataset.state = state;
  tile.firstChild.textContent = letter || '';
  tile.setAttribute('aria-label', tileLabel(letter, state));
}

export function createBoard(cols, rows) {
  const board = h('div', { class: 'sp-board', role: 'group', 'aria-label': 'Guesses' });
  const rowEls = [];
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    const row = h('div', { class: 'sp-row', role: 'group', 'aria-label': `Guess ${r + 1} of ${rows}` });
    tiles.push([]);
    for (let c = 0; c < cols; c++) {
      const tile = h('div', { class: 'sp-tile', 'data-state': 'empty', role: 'img', 'aria-label': 'empty' }, h('span', { class: 'sp-l' }));
      row.append(tile);
      tiles[r].push(tile);
    }
    board.append(row);
    rowEls.push(row);
  }
  const sky = s('svg', { class: 'sp-sky', 'aria-hidden': 'true', focusable: 'false' });
  const wrap = h('div', { class: 'sp-board-wrap' }, board, sky);
  return { wrap, board, rows: rowEls, tiles, sky };
}
