// The on-screen keyboard: three QWERTY rows, Enter and Delete.

import { h } from './dom.js';
import { STATE_LABEL } from './board.js';

const ROWS = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];

export function createKeyboard(onKey) {
  const keys = {};
  const press = (key) => (e) => {
    // After a tap or click, give the focus back to the page, so the physical Enter key submits
    // the guess instead of pressing this button again. Keyboard users (detail 0) keep focus.
    if (e.detail > 0) e.currentTarget.blur();
    onKey(key);
  };
  const key = (k, label = k, cls = '') => {
    const b = h('button', { type: 'button', class: `sp-key${cls}`, 'data-key': k, 'aria-label': label, onclick: press(k) }, h('span', { class: 'sp-l' }, k.length === 1 ? k : label));
    if (k.length === 1) keys[k] = b;
    return b;
  };
  const el = h(
    'div',
    { class: 'sp-keys', role: 'group', 'aria-label': 'Keyboard' },
    h('div', { class: 'sp-krow' }, [...ROWS[0]].map((c) => key(c))),
    h('div', { class: 'sp-krow' }, h('span', { class: 'sp-khalf' }), [...ROWS[1]].map((c) => key(c)), h('span', { class: 'sp-khalf' })),
    h('div', { class: 'sp-krow' }, key('Enter', 'Enter', ' sp-kwide'), [...ROWS[2]].map((c) => key(c)), key('Backspace', 'Delete', ' sp-kwide')),
  );
  return {
    el,
    setState(letter, state) {
      const b = keys[letter];
      if (!b) return;
      b.dataset.state = state;
      b.setAttribute('aria-label', `${letter}, ${STATE_LABEL[state]}`);
    },
  };
}
