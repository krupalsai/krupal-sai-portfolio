import './style.css';

// Text + layout paint first. The heavy Three.js scene loads afterwards,
// in a separate chunk, once the browser is idle.
function whenIdle(cb: () => void): void {
  const ric = (window as unknown as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
  if (ric) ric(cb, { timeout: 1500 });
  else setTimeout(cb, 300);
}

function boot(): void {
  whenIdle(() => {
    import('./scene')
      .then((m) => m.initScene())
      .catch(() => {
        const fb = document.getElementById('sceneFallback');
        if (fb) fb.hidden = false;
      });
  });
}

if (document.readyState === 'complete') boot();
else window.addEventListener('load', boot, { once: true });

// Production lab: loaded only when the section is about to be seen
{
  const root = document.getElementById('labRoot');
  if (root) {
    let done = false;
    const load = () => {
      if (done) return; done = true;
      import('./lab').then((l) => l.initLab(root)).catch(() => { root.textContent = 'The lab failed to load.'; });
    };
    new IntersectionObserver((e) => { if (e[0].isIntersecting) load(); }, { rootMargin: '600px' }).observe(root);
    if (location.hash === '#lab') load();
  }
}
