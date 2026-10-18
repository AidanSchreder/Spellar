// Small modal dialogs (How to play, Stats, Français) on the native <dialog> element, which
// handles focus, Escape and the inert background itself.

import { h } from './dom.js';

let count = 0;

export function createDialog(root, { title, titleLang, hideTitle = false, className = '' }) {
  const id = `sp-dialog-${++count}`;
  const body = h('div', { class: 'sp-dialog-body' });
  const dialog = h(
    'dialog',
    { class: `sp-dialog ${className}`.trim(), 'aria-labelledby': id },
    h(
      'div',
      { class: 'sp-dialog-inner' },
      h('h2', { class: hideTitle ? 'sp-sr' : 'sp-dialog-title', id, lang: titleLang }, title),
      body,
      h('form', { method: 'dialog', class: 'sp-dialog-actions' }, h('button', { class: 'sp-button sp-close', value: 'close' }, 'Close')),
    ),
  );
  // The dialog element itself has no padding, so a click whose target is the dialog landed on
  // the backdrop outside the box: close.
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close();
  });
  root.append(dialog);

  function open(content) {
    if (content) body.replaceChildren(...[].concat(content));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }
  function close() {
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.removeAttribute('open');
  }
  return { dialog, body, open, close, isOpen: () => dialog.open };
}
