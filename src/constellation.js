// Where the stars go. For each letter position, the star sits on the first row where that
// position was correct. On a loss, positions never solved get a hollow ring on the last row.
// The line runs in letter order and only joins neighbouring solved positions.

import { CORRECT } from './evaluate.js';

export function starsFor(results, length) {
  const stars = [];
  for (let col = 0; col < length; col++) {
    const row = results.findIndex((r) => r[col] === CORRECT);
    stars.push(row >= 0 ? { col, row, solved: true } : { col, row: results.length - 1, solved: false });
  }
  return stars;
}

export function segmentsFor(stars) {
  const segments = [];
  for (let i = 1; i < stars.length; i++) {
    if (stars[i - 1].solved && stars[i].solved) segments.push([i - 1, i]);
  }
  return segments;
}
