// The constellation layer: one SVG laid exactly over the board. Stars sit at tile centres measured
// from the real tile boxes, and are measured again whenever the board changes size.

import { s } from './dom.js';
import { segmentsFor } from '../constellation.js';

export function buildSky(svg, stars) {
  svg.replaceChildren();
  const segments = segmentsFor(stars);
  const lineLayer = s('g', { class: 'sp-lines' });
  const starLayer = s('g', { class: 'sp-stars' });
  const lines = segments.map(() => lineLayer.appendChild(s('line', { class: 'sp-line' })));
  const nodes = stars.map((st) => {
    const g = s('g', { class: st.solved ? 'sp-star' : 'sp-ring' });
    if (st.solved) {
      g.append(s('circle', { class: 'sp-star-halo' }), s('circle', { class: 'sp-star-dot' }));
    } else {
      g.append(s('circle', { class: 'sp-ring-line' }));
    }
    return starLayer.appendChild(g);
  });
  svg.append(lineLayer, starLayer);
  return { stars, segments, lines, nodes, points: [] };
}

// Positions every element from the tiles' current boxes. Call only while no tile is transformed.
export function layoutSky(svg, sky, tiles, wrap) {
  const box = wrap.getBoundingClientRect();
  svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`);
  svg.setAttribute('width', box.width);
  svg.setAttribute('height', box.height);
  const size = tiles[0][0].getBoundingClientRect().width;
  const r = Math.max(4, size * 0.136); // ~6 px on a 44 px tile, so the dot is ~12 px across
  sky.points = sky.stars.map((st) => {
    const t = tiles[st.row][st.col].getBoundingClientRect();
    return { x: t.left - box.left + t.width / 2, y: t.top - box.top + t.height / 2 };
  });
  sky.nodes.forEach((g, i) => {
    const { x, y } = sky.points[i];
    // Each star scales from its own centre, so its group is moved there and drawn around 0,0.
    g.setAttribute('transform', `translate(${x} ${y})`);
    for (const c of g.children) {
      c.setAttribute('cx', 0);
      c.setAttribute('cy', 0);
      c.setAttribute('r', c.classList.contains('sp-star-halo') ? r + 2 : r);
    }
  });
  sky.lines.forEach((line, i) => {
    const [a, b] = sky.segments[i];
    line.setAttribute('x1', sky.points[a].x);
    line.setAttribute('y1', sky.points[a].y);
    line.setAttribute('x2', sky.points[b].x);
    line.setAttribute('y2', sky.points[b].y);
  });
  return sky;
}
