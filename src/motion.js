// The four signature moments. This first version changes everything instantly; it is also the
// behaviour for players who ask their system for reduced motion. The GSAP versions replace these.

export function prefersReducedMotion() {
  return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

export function pop() {}

export async function reveal({ count, apply }) {
  for (let i = 0; i < count; i++) apply(i);
}

export async function shake() {}

export async function finale({ showSky, showText }) {
  showSky();
  showText();
}

export function skip() {}
