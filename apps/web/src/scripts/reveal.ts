// Scroll reveal (docs/17 §8). Marks elements `is-in` as they approach the viewport; CSS does the animating.
// Safe by construction: elements are only hidden by CSS while `html.reveal-ready` is set (armed by public/a11y-init.js and
// disarmed again after 3 s if this script never reports in), and everything is visible without JS or with reduced motion.
const root = document.documentElement;
if (root.classList.contains('reveal-ready')) {
  const targets = document.querySelectorAll<HTMLElement>('main .section .container > *, main .section .grid > *, main .section .steps > li');
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        (e.target as HTMLElement).classList.add('is-in');
        io.unobserve(e.target);
      }
    },
    { threshold: 0.08, rootMargin: '0px 0px -6% 0px' },
  );
  targets.forEach((t) => io.observe(t));
  root.setAttribute('data-reveal-active', '1');
}

export {};
