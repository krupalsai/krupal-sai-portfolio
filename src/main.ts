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
