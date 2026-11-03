import * as THREE from 'three';

/* ============================================================
   THE VERIFICATION PIPELINE — cinematic hero scene
   STUDENT → UPI → WEBHOOK → DATABASE → ADMIN
   Counters are illustrative demo only.

   Every visual serves the pipeline story: energy flowing through
   the tube, the webhook catching fakes, verified payments landing.
   No decorative extras.

   Performance notes:
   - loaded lazily (see main.ts) so text paints before Three.js
   - render loop pauses when hero is off-screen or tab hidden
   - low-power profile on phones / weak CPUs
   - motion toggle + prefers-reduced-motion respected
   ============================================================ */

interface NodeDef {
  key: string;
  label: string;
  sub: string;
  color: number;
  makeGeo: () => THREE.BufferGeometry;
}

const NODE_DEFS: NodeDef[] = [
  { key: 'student',  label: 'STUDENT',  sub: 'pays via UPI',       color: 0x38e1ff, makeGeo: () => new THREE.IcosahedronGeometry(0.62, 0) },
  { key: 'upi',      label: 'UPI',      sub: 'collects payment',   color: 0x7c6bff, makeGeo: () => new THREE.TorusGeometry(0.5, 0.2, 16, 40) },
  { key: 'webhook',  label: 'WEBHOOK',  sub: 'verifies signature', color: 0xffb020, makeGeo: () => new THREE.OctahedronGeometry(0.66, 0) },
  { key: 'database', label: 'DATABASE', sub: 'records payment',    color: 0x4dff9d, makeGeo: () => new THREE.CylinderGeometry(0.5, 0.5, 0.85, 24) },
  { key: 'admin',    label: 'ADMIN',    sub: 'sees it live',       color: 0xff5d7e, makeGeo: () => new THREE.BoxGeometry(0.85, 0.85, 0.85) },
];

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const LOW =
  window.matchMedia('(max-width: 768px)').matches ||
  (navigator.hardwareConcurrency || 8) <= 4;

function glowTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

function loadMotionPref(): boolean {
  if (REDUCED) return false;
  try { return localStorage.getItem('motion') !== 'off'; } catch { return true; }
}
function saveMotionPref(on: boolean): void {
  try { localStorage.setItem('motion', on ? 'on' : 'off'); } catch { /* ignore */ }
}

export function initScene(): void {
  const wrap = document.getElementById('sceneWrap')!;
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const labelsBox = document.getElementById('labels')!;
  const toggleBtn = document.getElementById('motionToggle') as HTMLButtonElement | null;

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !LOW,
      alpha: true,
      powerPreference: 'high-performance',
    });
  } catch {
    document.getElementById('sceneFallback')!.hidden = false;
    canvas.style.display = 'none';
    return;
  }

  let motion = loadMotionPref();

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070f, 0.022);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 1.6, 14.5);

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, LOW ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;

  scene.add(new THREE.AmbientLight(0x8899ff, LOW ? 0.8 : 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 1.5);
  dir.position.set(5, 9, 7);
  scene.add(dir);
  const rim = new THREE.DirectionalLight(0x38e1ff, 0.7);
  rim.position.set(-6, 3, -4);
  scene.add(rim);

  // ---- faint depth dust: dim, sparse, far behind the pipeline ----
  {
    const n = LOW ? 120 : 260;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 70;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 2] = -16 - Math.random() * 30;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0x5a6f9e, size: 0.07, transparent: true, opacity: 0.45, sizeAttenuation: true });
    scene.add(new THREE.Points(g, m));
  }

  // ---- nodes ----
  const glowTex = glowTexture();
  interface NodeObj { def: NodeDef; mesh: THREE.Mesh; phase: number; baseY: number; labelEl: HTMLDivElement; }
  const nodes: NodeObj[] = [];
  const positions: THREE.Vector3[] = [];
  const SPACING = 4.1;

  NODE_DEFS.forEach((def, i) => {
    const x = (i - (NODE_DEFS.length - 1) / 2) * SPACING;
    const baseY = Math.sin(i * 1.3) * 0.35;
    const p = new THREE.Vector3(x, baseY, 0);
    positions.push(p);

    const mat = new THREE.MeshStandardMaterial({
      color: def.color, emissive: def.color, emissiveIntensity: LOW ? 0.85 : 0.62,
      roughness: 0.28, metalness: 0.6,
    });
    const mesh = new THREE.Mesh(def.makeGeo(), mat);
    mesh.position.copy(p);
    mesh.userData.nodeIndex = i;
    scene.add(mesh);

    // layered glow: tight hot core + wide soft halo
    const core = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: def.color, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    core.scale.setScalar(2.2);
    core.position.copy(p);
    scene.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: def.color, transparent: true, opacity: 0.22,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(5.2);
    halo.position.copy(p);
    scene.add(halo);

    if (!LOW) {
      const light = new THREE.PointLight(def.color, 16, 14, 2);
      light.position.copy(p).add(new THREE.Vector3(0, 0.6, 1.6));
      scene.add(light);
    }

    const el = document.createElement('div');
    el.className = 'node-label';
    el.innerHTML = `${def.label}<small>${def.sub}</small>`;
    labelsBox.appendChild(el);

    nodes.push({ def, mesh, phase: i * 1.7, baseY, labelEl: el });
  });

  // ---- luminous tube linking the nodes ----
  const curve = new THREE.CatmullRomCurve3(positions);
  {
    const tubeGeo = new THREE.TubeGeometry(curve, LOW ? 80 : 140, 0.085, LOW ? 8 : 12, false);
    const tubeMat = new THREE.MeshBasicMaterial({
      color: 0x35d8ff, transparent: true, opacity: 0.4,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    scene.add(new THREE.Mesh(tubeGeo, tubeMat));
  }

  // ---- energy flow: bright motes streaming through the tube (money moving) ----
  interface Flow { mesh: THREE.Mesh; t: number; speed: number; }
  const flows: Flow[] = [];
  {
    const g = new THREE.SphereGeometry(0.07, 8, 8);
    const m = new THREE.MeshBasicMaterial({
      color: 0xbdf3ff, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const count = LOW ? 16 : 30;
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(g, m);
      const f: Flow = { mesh, t: Math.random(), speed: 0.05 + Math.random() * 0.06 };
      mesh.position.copy(curve.getPointAt(f.t));
      flows.push(f);
      scene.add(mesh);
    }
  }

  // ---- pulses ----
  interface Pulse { mesh: THREE.Mesh; halo: THREE.Sprite; t: number; speed: number; kind: 'good' | 'fake'; }
  const pulses: Pulse[] = [];
  const pulseGeo = new THREE.SphereGeometry(0.17, 14, 14);

  function spawnPulse(kind: 'good' | 'fake'): void {
    const color = kind === 'good' ? 0x4dff9d : 0xff3b5c;
    const mesh = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color, transparent: true, opacity: 0.75,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.setScalar(1.2);
    mesh.add(halo);
    mesh.position.copy(curve.getPointAt(0));
    scene.add(mesh);
    pulses.push({ mesh, halo, t: 0, speed: kind === 'good' ? 0.42 : 0.3, kind });
    start();
  }
  function removePulse(p: Pulse): void {
    scene.remove(p.mesh);
    (p.mesh.material as THREE.Material).dispose();
    (p.halo.material as THREE.Material).dispose();
  }

  // ---- shard bursts (fake receipts rejected at the webhook) ----
  interface Shard { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; }
  const shards: Shard[] = [];
  const shardGeo = new THREE.TetrahedronGeometry(0.11);
  function shardBurst(at: THREE.Vector3, color: number): void {
    const n = LOW ? 14 : 30;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(shardGeo, new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 1,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.position.copy(at);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize().multiplyScalar(2.6 + Math.random() * 3.4);
      shards.push({ mesh: m, vel: v, life: 1 });
      scene.add(m);
    }
  }

  // ---- flash rings ----
  interface Ring { mesh: THREE.Mesh; life: number; }
  const rings: Ring[] = [];
  const ringGeo = new THREE.RingGeometry(0.85, 1.0, 48);
  function flashRing(at: THREE.Vector3, color: number): void {
    const m = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    m.position.copy(at);
    scene.add(m);
    rings.push({ mesh: m, life: 1 });
  }

  // ---- counters ----
  const verifiedEl = document.getElementById('verifiedCount')!;
  const fakesEl = document.getElementById('fakesCount')!;
  let verified = 0;
  let fakes = 0;

  const verifyBtn = document.getElementById('verifyBtn') as HTMLButtonElement;
  verifyBtn.addEventListener('click', () => spawnPulse('good'));

  // ---- interaction: hover + click ----
  const raycaster = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2(-10, -10);
  const mouse = new THREE.Vector2(0, 0);
  let hovered: number | null = null;
  let pickDirty = false;

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const r = wrap.getBoundingClientRect();
    mouse.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    mouse.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    pointerNDC.copy(mouse);
    pickDirty = true;
  }, { passive: true });

  canvas.addEventListener('click', () => {
    if (hovered === 0) spawnPulse('good');
  });

  // ---- loop state ----
  const clock = new THREE.Clock();
  let raf = 0;
  let inView = true;
  let tabVisible = !document.hidden;
  let renderOnce = true;
  let lastFake = 0;
  let lastGood = 0;

  // ---- resize ----
  let lastW = 0;
  let lastH = 0;
  function resize(): void {
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    if (w === lastW && Math.abs(h - lastH) < 60 && lastH !== 0) return;
    lastW = w; lastH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (w >= 1000) {
      camera.position.z = 14.5 * 1.42;
      camera.setViewOffset(w, h, -w * 0.17, 0, w, h);
    } else {
      camera.position.z = 14.5 * Math.max(1, 1.6 / camera.aspect);
      camera.clearViewOffset();
    }
    camera.updateProjectionMatrix();
    renderOnce = true;
    start();
  }
  new ResizeObserver(resize).observe(wrap);
  resize();

  // ---- labels ----
  const tmpV = new THREE.Vector3();
  function updateLabels(): void {
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    for (const n of nodes) {
      tmpV.copy(n.mesh.position).project(camera);
      const x = (tmpV.x * 0.5 + 0.5) * w;
      const y = (-tmpV.y * 0.5 + 0.5) * h;
      n.labelEl.style.opacity = tmpV.z < 1 ? '1' : '0';
      n.labelEl.style.transform = `translate(-50%, -135%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  }

  // ---- loop control: only run while visible ----
  function start(): void {
    if (raf || !inView || !tabVisible) return;
    clock.getDelta();
    raf = requestAnimationFrame(tick);
  }
  function stop(): void {
    cancelAnimationFrame(raf);
    raf = 0;
  }

  new IntersectionObserver((entries) => {
    inView = entries[0].isIntersecting;
    inView ? start() : stop();
  }, { threshold: 0 }).observe(wrap);

  document.addEventListener('visibilitychange', () => {
    tabVisible = !document.hidden;
    tabVisible ? start() : stop();
  });

  // ---- motion toggle ----
  function syncToggle(): void {
    if (!toggleBtn) return;
    toggleBtn.textContent = motion ? 'Motion: on' : 'Motion: off';
    toggleBtn.setAttribute('aria-pressed', String(motion));
  }
  if (toggleBtn) {
    toggleBtn.hidden = false;
    syncToggle();
    toggleBtn.addEventListener('click', () => {
      motion = !motion;
      saveMotionPref(motion);
      syncToggle();
      renderOnce = true;
      start();
    });
  }

  function tick(): void {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    if (pickDirty) {
      pickDirty = false;
      raycaster.setFromCamera(pointerNDC, camera);
      const hits = raycaster.intersectObjects(nodes.map((n) => n.mesh), false);
      hovered = hits.length ? (hits[0].object.userData.nodeIndex as number) : null;
      canvas.style.cursor = hovered !== null ? 'pointer' : 'default';
    }

    // nodes: gentle cinematic float + slow spin, staggered
    let scaling = false;
    nodes.forEach((n, i) => {
      if (motion) {
        n.mesh.rotation.x += dt * 0.35;
        n.mesh.rotation.y += dt * (0.3 + i * 0.06);
        n.mesh.position.y = n.baseY + Math.sin(t * 0.9 + n.phase) * 0.22;
      }
      const target = hovered === i ? 1.28 : 1;
      const cur = n.mesh.scale.x;
      if (Math.abs(cur - target) > 0.002) {
        n.mesh.scale.setScalar(THREE.MathUtils.lerp(cur, target, 0.12));
        scaling = true;
      }
    });

    // energy flow along the tube
    if (motion) {
      for (const f of flows) {
        f.t += f.speed * dt;
        if (f.t > 1) f.t -= 1;
        f.mesh.position.copy(curve.getPointAt(f.t));
      }
    }

    // pulses
    const webhookT = 2 / (NODE_DEFS.length - 1);
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i];
      p.t += p.speed * dt;
      if (p.kind === 'good' && p.t >= 1) {
        flashRing(positions[NODE_DEFS.length - 1], 0x4dff9d);
        verified += 1;
        verifiedEl.textContent = String(verified);
        removePulse(p);
        pulses.splice(i, 1);
      } else if (p.kind === 'fake' && p.t >= webhookT) {
        const at = curve.getPointAt(webhookT);
        shardBurst(at, 0xff3b5c);
        flashRing(at, 0xff3b5c);
        fakes += 1;
        fakesEl.textContent = String(fakes);
        removePulse(p);
        pulses.splice(i, 1);
      } else {
        p.mesh.position.copy(curve.getPointAt(Math.min(p.t, 1)));
      }
    }

    // shards
    for (let i = shards.length - 1; i >= 0; i--) {
      const s = shards[i];
      s.life -= dt * 0.9;
      s.mesh.position.addScaledVector(s.vel, dt);
      s.vel.multiplyScalar(0.96);
      (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(s.life, 0);
      if (s.life <= 0) {
        scene.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
        shards.splice(i, 1);
      }
    }

    // rings
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt * 1.1;
      r.mesh.scale.setScalar(1 + (1 - r.life) * 2.4);
      r.mesh.lookAt(camera.position);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(r.life, 0) * 0.9;
      if (r.life <= 0) {
        scene.remove(r.mesh);
        (r.mesh.material as THREE.Material).dispose();
        rings.splice(i, 1);
      }
    }

    // the story tells itself: fakes probe the webhook, payments verify
    if (motion && t - lastFake > 7) {
      lastFake = t;
      spawnPulse('fake');
    }
    if (motion && t - lastGood > 13) {
      lastGood = t;
      spawnPulse('good');
    }

    // slow cinematic camera drift + gentle mouse parallax
    if (motion) {
      camera.position.x = THREE.MathUtils.lerp(camera.position.x, Math.sin(t * 0.12) * 0.9 + mouse.x * 1.1, 0.04);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, 1.6 + Math.cos(t * 0.09) * 0.35 + mouse.y * 0.6, 0.04);
    }
    camera.lookAt(0, 0.2, 0);

    const active = motion || scaling || pulses.length > 0 || shards.length > 0 || rings.length > 0;
    if (!active && !renderOnce) { stop(); return; }
    renderOnce = false;

    updateLabels();
    renderer.render(scene, camera);
  }

  // one demo pulse so the scene isn't static on load
  setTimeout(() => spawnPulse('good'), 1200);
  start();
}
