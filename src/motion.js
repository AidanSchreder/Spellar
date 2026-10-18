// The signature moments, and nothing else moves:
//   1. letter pop     a typed tile scales 1 → 1.06 → 1 in 100 ms
//   2. star reveal    left to right, a star grows from each tile's centre and stamps its new state
//   3. invalid shake  the row swings ±6 px, five times, in 300 ms
//   4. constellation  the board fades to a faint sky, stars pop in letter order, a hairline joins
//                     them, then the answer label, the fact and the results set in
//   5. title swap     now and then the p of "Spellar" fades into a t ("Stellar") and back
//
// GSAP (and DrawSVG for the hairlines) come from assets/vendor as window globals. With reduced
// motion asked for, or GSAP missing, every state change happens instantly instead.
// Each build* function returns a timeline so dev/sandbox.html can scrub it with GSDevTools.

const T = {
  pop: 0.1,
  starPerTile: 0.15,
  starGrow: 0.42,
  starOpen: 0.16,
  shake: 0.3,
  pause: 0.3,
  fade: 0.4,
  sky: 0.14,
  starPop: 0.18,
  starStagger: 0.12,
  segment: 0.25,
  label: 0.5,
  text: 0.3,
  swap: 0.45,
  swapHold: 1.6,
  swapFirst: 5,
  swapEvery: [25, 45],
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

/* ---- 2. Star reveal ---- */

// A five-pointed star (inner radius 40% of the outer) as a clip-path, centred on the box, scaled so
// that 1 just fits the box and turned by `turn` degrees. At STAR_COVER its inner corners reach past
// the box's corners, so the star covers the whole tile.
const STAR_INNER = 0.4;
const STAR_COVER = 0.75 / (0.5 * STAR_INNER);

export function starClip(scale, turn = 0) {
  const pts = [];
  for (let k = 0; k < 10; k++) {
    const a = ((k * 36 - 90 + turn) * Math.PI) / 180;
    const r = (k % 2 ? 0.5 * STAR_INNER : 0.5) * scale * 100;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(2)}% ${(50 + r * Math.sin(a)).toFixed(2)}%`);
  }
  return `polygon(${pts.join(', ')})`;
}

// look(i, el) draws tile i's new state on el; apply(i) gives the tile itself that state. Each tile
// gets a cover, a copy of itself in the new state, clipped to a star that grows from the centre
// until it fills the tile; then the tile takes the state and the cover goes. A wrong-spot tile is
// white in the middle, which would hide the star, so its cover starts fully hatched (is-filling)
// and opens its white square once the star has filled the tile.
export function buildReveal({ tiles, count, look, apply }, vars = {}) {
  const gsap = engine();
  const tl = gsap.timeline(vars);
  tiles.slice(0, count).forEach((tile, i) => {
    const at = i * T.starPerTile;
    const star = { scale: 0, turn: -36, open: 0 };
    let cover = null;
    const opening = () => cover && cover.dataset.state === 'present';
    tl.call(() => {
      cover?.remove();
      cover = tile.cloneNode(true);
      cover.removeAttribute('style'); // no leftover transform from the letter pop
      cover.classList.add('sp-cover');
      cover.removeAttribute('role');
      cover.setAttribute('aria-hidden', 'true');
      look(i, cover);
      cover.style.clipPath = starClip(0);
      if (opening()) cover.style.setProperty('--sp-open', '0');
      tile.append(cover);
    }, null, at);
    // power2.in: the star grows slowly while it is small enough to read as a star, then fills.
    tl.to(star, {
      scale: STAR_COVER,
      turn: 0,
      duration: T.starGrow,
      ease: 'power2.in',
      onUpdate: () => cover && (cover.style.clipPath = starClip(star.scale, star.turn)),
    }, at);
    tl.to(star, {
      open: 1,
      duration: T.starOpen,
      ease: 'power2.out',
      onUpdate: () => opening() && cover.style.setProperty('--sp-open', star.open.toFixed(3)),
    }, at + T.starGrow);
    tl.call(() => {
      apply(i);
      cover?.remove();
      cover = null;
    }, null, at + T.starGrow + T.starOpen);
  });
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

/* ---- 5. Title swap ---- */

// slot holds the p (in the flow, so it sets the slot's width) and the t (laid over it, hidden).
// The p fades out as the t fades in and the slot narrows to the t's width, so "Stellar" closes up
// like a word set that way; a moment later it turns back.
export function buildTitleSwap({ slot, p, t }, vars = {}) {
  const gsap = engine();
  const wide = slot.getBoundingClientRect().width;
  const narrow = t.getBoundingClientRect().width;
  const back = T.swap + T.swapHold;
  return gsap
    .timeline(vars)
    .set(slot, { width: wide }, 0)
    .to(slot, { width: narrow, duration: T.swap, ease: 'power2.inOut' }, 0)
    .to(p, { autoAlpha: 0, duration: T.swap * 0.7, ease: 'sine.in' }, 0)
    .to(t, { autoAlpha: 1, duration: T.swap * 0.7, ease: 'sine.out' }, T.swap * 0.3)
    .to(slot, { width: wide, duration: T.swap, ease: 'power2.inOut' }, back)
    .to(t, { autoAlpha: 0, duration: T.swap * 0.7, ease: 'sine.in' }, back)
    .to(p, { autoAlpha: 1, duration: T.swap * 0.7, ease: 'sine.out' }, back + T.swap * 0.3)
    .set(slot, { clearProps: 'width' })
    .set([p, t], { clearProps: 'opacity,visibility' });
}

// First a few seconds after the page opens, then every 25 to 45 s while the page is in view.
// Never with reduced motion: the title then always reads "Spellar".
export function titleSwaps(title) {
  if (prefersReducedMotion()) return;
  const [min, max] = T.swapEvery;
  const later = (s) => setTimeout(run, s * 1000);
  function run() {
    if (!document.hidden && engine()) buildTitleSwap(title);
    later(min + Math.random() * (max - min));
  }
  later(T.swapFirst);
}
