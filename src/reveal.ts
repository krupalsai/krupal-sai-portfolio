/* Scroll-reveal: the standard "frontend dev" polish.
   Elements fade and rise into view once, with a stagger inside grids.
   Respects prefers-reduced-motion (everything just shows). */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function initReveal(): void {
  const targets = Array.from(
    document.querySelectorAll<HTMLElement>('.section, .card, .titem, .skill, .hero-copy > *')
  );
  if (!targets.length) return;

  if (REDUCED) {
    targets.forEach((el) => el.classList.add('in'));
    return;
  }

  targets.forEach((el) => el.classList.add('reveal'));

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        // stagger siblings inside the same grid
        const sibs = Array.from(el.parentElement?.children ?? []).filter((c) =>
          (c as HTMLElement).classList.contains('reveal')
        );
        const idx = sibs.indexOf(el);
        if (idx > 0 && idx < 6) el.style.transitionDelay = `${Math.min(idx * 70, 350)}ms`;
        el.classList.add('in');
        io.unobserve(el);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
  );

  targets.forEach((el) => io.observe(el));
}
