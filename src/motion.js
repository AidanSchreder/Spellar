// The four signature moments, and nothing else moves:
//   1. letter pop     a typed tile scales 1 → 1.06 → 1 in 100 ms
//   2. scan reveal    a hairline sweeps the row; each tile flips as the line crosses its centre
//   3. invalid shake  the row swings ±6 px, five times, in 300 ms
//   4. constellation  the board fades to a faint sky, stars pop in letter order, a hairline joins
//                     them, then the answer label, the fact and the results set in
//
// GSAP (and DrawSVG for the hairlines) come from assets/vendor as window globals. With reduced
// motion asked for, or GSAP missing, every state change happens instantly instead.
// Each build* function returns a timeline so dev/sandbox.html can scrub it with GSDevTools.

const T = {
  pop: 0.1,
  scanPerTile: 0.14,
  flip: 0.28,
  scanFade: 0.12,
  shake: 0.3,
  pause: 0.3,
  fade: 0.4,
  sky: 0.14,
  starPop: 0.18,
  starStagger: 0.12,
  segment: 0.25,
  label: 0.5,
  text: 0.3,
};
export const TIMING = T;

function engine() {
  const g = window.gsap;
  if (!g) return null;
  if (window.DrawSVGPlugin && !engine.registered) {
    g.registerPlugin(window.DrawSVGPlugin);
    engine.registered = true;
  }
  return g;
}

export function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

const animated = () => !prefersReducedMotion() && engine() !== null;

// A timeline's own promise: unlike eventCallback('onComplete'), it leaves the timeline's callback in place.
const done = (tl) => tl.then(() => {});

/* ---- 1. Letter pop ---- */

export function pop(tile) {
  if (!animated()) return;
  engine().fromTo(
    tile,
    { scale: 1 },
    { keyframes: [{ scale: 1.06, duration: T.pop / 2 }, { scale: 1, duration: T.pop / 2 }], ease: 'power1.out', overwrite: 'auto', clearProps: 'transform' },
  );
}

/* ---- 2. Scan-line reveal ---- */

export function buildReveal({ row, tiles, scan, count, apply }, vars = {}) {
  const gsap = engine();
  const wrap = scan.parentNode.getBoundingClientRect();
  const first = tiles[0].getBoundingClientRect();
  const last = tiles[count - 1].getBoundingClientRect();
  const startX = first.left - wrap.left;
  const endX = last.right - wrap.left;
  const sweep = count * T.scanPerTile; // constant speed: about 140 ms per tile
  const tl = gsap.timeline(vars);

  tl.set(scan, { x: startX, y: first.top - wrap.top - 4, height: first.height + 8, autoAlpha: 1 }, 0);
  tl.to(scan, { x: endX, duration: sweep, ease: 'none' }, 0);
  tiles.slice(0, count).forEach((tile, i) => {
    const box = tile.getBoundingClientRect();
    const crossesCentre = ((box.left + box.width / 2 - wrap.left - startX) / (endX - startX)) * sweep;
    tl.to(tile, { scaleY: 0, duration: T.flip / 2, ease: 'power2.in', overwrite: 'auto' }, crossesCentre)
      .call(apply, [i], crossesCentre + T.flip / 2) // the new state shows at the midpoint
      .to(tile, { scaleY: 1, duration: T.flip / 2, ease: 'power2.out', clearProps: 'transform' }, crossesCentre + T.flip / 2);
  });
  tl.to(scan, { autoAlpha: 0, duration: T.scanFade, ease: 'none' }, sweep);
  return tl;
}

export async function reveal(opts) {
  if (!animated()) {
    for (let i = 0; i < opts.count; i++) opts.apply(i);
    return;
  }
  await done(buildReveal(opts));
}

/* ---- 3. Invalid shake ---- */

export function buildShake(row, vars = {}) {
  return engine()
    .timeline(vars)
    .to(row, { keyframes: { x: [0, -6, 6, -6, 6, -6, 0], easeEach: 'sine.inOut' }, duration: T.shake, ease: 'none', clearProps: 'transform' });
}

export function shake(row) {
  if (!animated() || !row) return;
  buildShake(row);
}

/* ---- 4. Constellation ---- */

let current = null;

export function buildFinale({ root, board, sky, label, fact, results }, vars = {}) {
  const gsap = engine();
  const tl = gsap.timeline({
    ...vars,
    onComplete() {
      // Hand over to the stylesheet, which also handles the tap-to-review toggle.
      root.classList.add('is-sky');
      gsap.set([board, label, fact, results], { clearProps: 'opacity,visibility,letterSpacing,paddingLeft' });
      // Drop DrawSVG's dash lengths so a later resize redraws whole lines.
      gsap.set(sky.lines, { clearProps: 'strokeDasharray,strokeDashoffset' });
      if (vars.onComplete) vars.onComplete();
    },
  });
  const bodies = sky.nodes.map((g) => g.firstChild);
  // Starting states are applied now, not at the timeline's first tick, so the finished layout
  // never shows for a frame before the sequence begins. The tweens below record these as their
  // start values, so scrubbing back to 0 restores them.
  gsap.set(bodies, { scale: 0, svgOrigin: '0 0' });
  gsap.set(sky.lines, { drawSVG: '0%' });
  gsap.set([fact, results], { autoAlpha: 0 });
  gsap.set(label, { autoAlpha: 0, letterSpacing: '0.04em', paddingLeft: '0.04em' });

  const fadeAt = T.pause;
  tl.to(board, { opacity: T.sky, duration: T.fade, ease: 'power1.inOut' }, fadeAt);

  const starsAt = fadeAt + T.fade;
  const landed = [];
  bodies.forEach((body, i) => {
    const at = starsAt + i * T.starStagger;
    tl.to(body, { scale: 1, duration: T.starPop, ease: 'back.out(2)' }, at);
    landed[i] = at + T.starPop;
  });
  // Each hairline draws from the previous star to the one that just landed (letter order).
  let linesEnd = starsAt + (bodies.length - 1) * T.starStagger + T.starPop;
  sky.lines.forEach((line, k) => {
    const to = sky.segments[k][1];
    tl.to(line, { drawSVG: '100%', duration: T.segment, ease: 'power1.inOut' }, landed[to]);
    linesEnd = Math.max(linesEnd, landed[to] + T.segment);
  });

  tl.to(label, { autoAlpha: 1, letterSpacing: '0.32em', paddingLeft: '0.32em', duration: T.label, ease: 'power2.out' }, linesEnd - 0.1);
  tl.to(fact, { autoAlpha: 1, duration: T.text, ease: 'power1.out' }, '>-0.2');
  tl.to(results, { autoAlpha: 1, duration: T.text, ease: 'power1.out' }, '>-0.1');
  return tl;
}

export async function finale(parts) {
  if (!animated()) {
    parts.root.classList.add('is-sky');
    return;
  }
  current = buildFinale(parts);
  await done(current);
  current = null;
}

// A tap or key press during the end sequence jumps straight to its end state.
export function skip() {
  if (current) current.progress(1);
}
