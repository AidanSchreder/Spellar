// Share text: one line of star characters per guess, never the answer.
// ★ correct, ✦ wrong spot, · not in word. All three have text presentation by default in
// Unicode (none is an emoji), so phones show them as type, not pictures.

const GLYPH = { correct: '★', present: '✦', absent: '·' };
export const LOSS_MARK = '✕';

export function shareText({ number, rows, maxGuesses, won }) {
  const score = won ? rows.length : LOSS_MARK;
  return [
    `Spellar #${number} ${score}/${maxGuesses}`,
    ...rows.map((row) => row.map((s) => GLYPH[s]).join('')),
    'seds.ca/spellar',
  ].join('\n');
}
