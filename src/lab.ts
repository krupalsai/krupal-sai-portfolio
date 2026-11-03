/* PRODUCTION LAB — a working model of the Student Platform.
   Real HMAC-SHA256 runs in the browser (WebCrypto). All data is simulated. */
type Pay = { id: string; order: string; gw: string; amt: number; st: 'verified' | 'recovered'; t: number };
const SECRET = 'whsec_demo_not_real';
const GWS = ['Razorpay', 'PhonePe', 'Cashfree'];
const enc = new TextEncoder();
const hex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b as ArrayBuffer)].map((x) => x.toString(16).padStart(2, '0')).join('');
const rnd = (n: number) => hex(crypto.getRandomValues(new Uint8Array(n)));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MOTION = !matchMedia('(prefers-reduced-motion: reduce)').matches;
const inr = (n: number) => '₹' + n.toLocaleString('en-IN');
const tm = (t: number) => new Date(t).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
async function sign(body: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(body)));
}
const safeEq = (a: string, b: string) => {
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
};

const S = {
  db: [] as Pay[], ledger: [] as { id: string; order: string; gw: string; amt: number }[],
  orders: {} as Record<string, number>, blocked: 0, feed: [] as string[],
  last: null as null | { body: string; sig: string },
  tok: null as null | { v: string; exp: number; used: boolean },
  chat: [] as { f: 'me' | 'bot' | 'sys'; h: string }[],
};
const log = (s: string) => { S.feed.unshift(`<b>${tm(Date.now())}</b> ${s}`); S.feed = S.feed.slice(0, 7); };
const mk = (gw: string, amt: number) => {
  const order = 'ord_' + rnd(3), id = 'pay_' + rnd(4);
  S.orders[order] = amt; S.ledger.push({ id, order, gw, amt });
  return { order, id, body: JSON.stringify({ event: 'payment.captured', gateway: gw, order_id: order, payment_id: id, amount: amt, currency: 'INR' }, null, 2) };
};

type Step = [string, boolean | null, string];
async function verify(body: string, sig: string, gw = '?') {
  const steps: Step[] = []; let ok = true, reason = '';
  const step = (l: string, pass: boolean, d: string, why = '') => {
    if (!ok) { steps.push([l, null, 'skipped']); return null; }
    steps.push([l, pass, d]); if (!pass) { ok = false; reason = why || d; } return pass;
  };
  step('Signature header present', !!sig, sig ? 'found' : 'missing', 'no signature');
  const calc = await sign(body);
  step('Recompute HMAC-SHA256 over the raw body', true, calc.slice(0, 16) + '…');
  step('Constant-time compare with header', safeEq(calc, sig), safeEq(calc, sig) ? 'match' : 'MISMATCH', 'signature mismatch (forged or tampered)');
  let p: any = null;
  try { p = JSON.parse(body); } catch { /* handled below */ }
  step('Order exists', !!(p && S.orders[p.order_id] !== undefined), p ? p.order_id : 'bad JSON', 'unknown order');
  step('Amount matches order', !!p && p.amount === S.orders[p?.order_id], p ? `${inr(p.amount)} vs ${inr(S.orders[p.order_id] ?? 0)}` : '-', 'amount differs from order');
  step('Not seen before (idempotency)', !!p && !S.db.some((d) => d.id === p.payment_id), p ? p.payment_id : '-', 'duplicate / replayed webhook');
  if (ok && p) { S.db.push({ id: p.payment_id, order: p.order_id, gw: p.gateway || gw, amt: p.amount, st: 'verified', t: Date.now() }); log(`✅ ${p.gateway} ${inr(p.amount)} verified`); }
  else { S.blocked++; log(`🛑 blocked: ${reason}`); }
  steps.push(['Write payment row to database', ok ? true : null, ok ? 'saved' : 'skipped']);
  return { steps, ok, reason };
}

const NODES: Record<string, [number, number, string, string, string]> = {
  student: [10, 16, 'Student', 'pays fees', 'Pays from a phone. Never sees the webhook secret — only the server does.'],
  admin: [270, 16, 'Admin', 'sees payments', 'Watches verified payments land live. Payments captured at the gateway but missing here are what reconciliation fixes.'],
  next: [140, 100, 'Next.js', 'app on Vercel', 'The Next.js app on Vercel. Student and admin screens talk to it.'],
  api: [140, 184, 'REST API', '150+ routes', 'Orders, payments, student records and bot hooks all go through the 150+ REST routes.'],
  bot: [10, 268, 'WhatsApp bot', 'support + login', 'Answers payment status and issues one-time login links.'],
  db: [140, 268, 'Supabase', 'PostgreSQL', 'A payment row is written only after verification passes.'],
  verifier: [270, 268, 'Webhook check', 'HMAC verify', 'One endpoint for Razorpay, PhonePe and Cashfree. Recomputes the signature over the raw body before trusting anything.'],
  gateways: [270, 352, 'Gateways', '3 providers', 'Razorpay, PhonePe and Cashfree collect the money and notify the platform by webhook.'],
};
const EDGES = [['student', 'next'], ['admin', 'next'], ['next', 'api'], ['api', 'db'], ['api', 'bot'], ['gateways', 'verifier'], ['verifier', 'db']];
const TRACE: [string, string][] = [
  ['student', 'Student taps Pay'], ['next', 'App asks the API to create an order'], ['api', 'API stores the order'],
  ['gateways', 'Student pays at the gateway'], ['verifier', 'Gateway sends a signed webhook; HMAC is checked'],
  ['db', 'Verified payment row is written'], ['admin', 'Admin sees it live'], ['bot', 'Bot can now answer “payment status”'],
];

export function initLab(root: HTMLElement): void {
  if (!crypto?.subtle) { root.innerHTML = '<p class="prose">The lab needs a secure (https) browser context.</p>'; return; }
  const seed = [['Razorpay', 1500], ['PhonePe', 2500], ['Cashfree', 5000]] as const;
  seed.forEach(([g, a]) => { const m = mk(g, a); S.db.push({ id: m.id, order: m.order, gw: g, amt: a, st: 'verified', t: Date.now() - 60000 }); });
  log('Seeded 3 demo payments');

  root.innerHTML = `
  <div class="lab-tabs" role="tablist">
    <button class="lab-tab on" data-tab="pay">Pay &amp; verify</button><button class="lab-tab" data-tab="admin">Admin</button>
    <button class="lab-tab" data-tab="bot">WhatsApp</button><button class="lab-tab" data-tab="arch">Architecture</button>
  </div>
  <div class="lab-pane on" data-pane="pay">
    <div class="lab-card"><h3>1 · Student pays</h3>
      <div class="chips" id="gwChips">${GWS.map((g, i) => `<button class="chip${i ? '' : ' on'}" data-gw="${g}">${g}</button>`).join('')}</div>
      <label class="lab-l">Amount (₹)<input id="amt" type="number" min="1" value="1500" inputmode="numeric"></label>
      <label class="lab-check"><input id="outage" type="checkbox"> Drop the webhook (simulate an outage)</label>
      <button class="btn primary" data-act="pay">Pay now</button></div>
    <div class="lab-card"><h3>2 · Gateway → webhook</h3>
      <label class="lab-l">Raw body (editable)<textarea id="body" rows="9" spellcheck="false" placeholder="Make a payment first"></textarea></label>
      <label class="lab-l">X-Signature (editable)<input id="sig" spellcheck="false"></label>
      <div class="row"><button class="btn ghost" data-act="send">Send edited</button>
      <button class="btn ghost atk" data-act="tamper">Tamper amount → ₹1</button>
      <button class="btn ghost atk" data-act="forge">Forge signature</button>
      <button class="btn ghost atk" data-act="replay">Replay</button></div></div>
    <div class="lab-card"><h3>3 · Server verification</h3><ol class="steps" id="steps"><li class="hint">Waiting for a request…</li></ol><div id="verdict"></div>
      <p class="note">Simplified model: the three gateways use different signature formats; here they are normalised to HMAC-SHA256.</p></div>
  </div>
  <div class="lab-pane" data-pane="admin">
    <div class="stats" id="stats"></div>
    <div class="row"><button class="btn ghost" data-act="recon">Run reconciliation</button><button class="btn ghost" data-act="live" id="liveBtn">Start live traffic</button></div>
    <div class="lab-card"><h3>Payments</h3><div class="tbl" id="tbl"></div></div>
    <div class="lab-card"><h3>Event feed</h3><ul class="feed" id="feed"></ul></div>
  </div>
  <div class="lab-pane" data-pane="bot"><div class="chat" id="chat"></div>
    <div class="chips"><button class="chip" data-q="status">Payment status</button><button class="chip" data-q="link">Login link</button><button class="chip" data-q="receipt">Receipt</button></div></div>
  <div class="lab-pane" data-pane="arch"><div class="arch">
    <svg viewBox="0 0 400 416" role="img" aria-label="System architecture">${EDGES.map(([a, b]) => { const A = NODES[a], B = NODES[b]; return `<line x1="${A[0] + 60}" y1="${A[1] + 23}" x2="${B[0] + 60}" y2="${B[1] + 23}" />`; }).join('')}
    ${Object.entries(NODES).map(([k, n]) => `<g class="nd" data-n="${k}" tabindex="0" role="button" transform="translate(${n[0]},${n[1]})"><rect width="120" height="46" rx="10"/><text x="60" y="19" class="t1">${n[2]}</text><text x="60" y="35" class="t2">${n[3]}</text></g>`).join('')}</svg>
    <div class="lab-card"><h3 id="aT">Tap a box</h3><p id="aD" class="note">Each box explains its role in the platform.</p><button class="btn primary" data-act="trace">▶ Trace a payment</button></div></div></div>
  <p class="note lab-foot">Everything here is a simulation. The signature check uses real HMAC-SHA256 in your browser; no real payments or student data are involved.</p>`;

  const q = <T extends HTMLElement>(s: string) => root.querySelector(s) as T;
  let gw = 'Razorpay', liveT = 0, liveN = 0, inView = true;
  new IntersectionObserver((e) => (inView = e[0].isIntersecting)).observe(root);

  const paint = () => {
    const un = S.ledger.filter((l) => !S.db.some((d) => d.id === l.id)).length;
    q('#stats').innerHTML = [['Verified', S.db.length], ['Collected', inr(S.db.reduce((s, d) => s + d.amt, 0))], ['Blocked', S.blocked], ['Unmatched', un]]
      .map(([l, v], i) => `<div class="stat${i === 2 ? ' bad' : i === 3 && un ? ' warn' : ''}"><b>${v}</b><span>${l}</span></div>`).join('');
    q('#tbl').innerHTML = '<table><tr><th>Ref</th><th>Gateway</th><th>Amount</th><th>Status</th></tr>' +
      S.db.slice(-6).reverse().map((d) => `<tr><td>${d.id.slice(0, 9)}</td><td>${d.gw}</td><td>${inr(d.amt)}</td><td><span class="bdg ${d.st}">${d.st}</span></td></tr>`).join('') + '</table>';
    q('#feed').innerHTML = S.feed.map((f) => `<li>${f}</li>`).join('');
  };
  const chat = () => { q('#chat').innerHTML = S.chat.map((m) => `<div class="msg ${m.f}">${m.h}</div>`).join(''); q('#chat').scrollTop = 1e6; };
  const say = async (f: 'me' | 'bot' | 'sys', h: string, delay = 0) => { if (delay && MOTION) await sleep(delay); S.chat.push({ f, h }); chat(); };

  const run = async (body: string, sig: string) => {
    const ol = q('#steps'); ol.innerHTML = ''; q('#verdict').innerHTML = '';
    const r = await verify(body, sig);
    for (const [l, p, d] of r.steps) {
      ol.insertAdjacentHTML('beforeend', `<li class="${p === null ? 'skip' : p ? 'ok' : 'no'}"><i>${p === null ? '–' : p ? '✓' : '✕'}</i><span>${l}<small>${d}</small></span></li>`);
      if (MOTION) await sleep(230);
    }
    q('#verdict').innerHTML = r.ok ? '<div class="vd ok">✅ Verified — payment recorded</div>' : `<div class="vd no">🛑 Rejected — ${r.reason}</div>`;
    paint();
  };
  const fill = (b: string, s: string) => { (q('#body') as HTMLTextAreaElement).value = b; (q('#sig') as HTMLInputElement).value = s; };

  const acts: Record<string, () => Promise<void> | void> = {
    pay: async () => {
      const amt = Math.max(1, Math.floor(+(q('#amt') as HTMLInputElement).value || 0));
      const m = mk(gw, amt), sig = await sign(m.body); S.last = { body: m.body, sig }; fill(m.body, sig);
      if ((q('#outage') as HTMLInputElement).checked) {
        log(`⚠ ${gw} captured ${inr(amt)} but the webhook never arrived`);
        q('#steps').innerHTML = '<li class="no"><i>✕</i><span>Webhook never delivered<small>Money is captured at the gateway but not in your database. Open Admin → Run reconciliation.</small></span></li>';
        q('#verdict').innerHTML = ''; paint(); return;
      }
      await run(m.body, sig);
    },
    send: () => run((q('#body') as HTMLTextAreaElement).value, (q('#sig') as HTMLInputElement).value),
    tamper: () => {
      if (!S.last) return; const p = JSON.parse(S.last.body); p.amount = 1; const b = JSON.stringify(p, null, 2);
      fill(b, S.last.sig); return run(b, S.last.sig);
    },
    forge: () => { if (!S.last) return; const s = rnd(32); fill(S.last.body, s); return run(S.last.body, s); },
    replay: () => { if (!S.last) return; fill(S.last.body, S.last.sig); return run(S.last.body, S.last.sig); },
    recon: () => {
      const miss = S.ledger.filter((l) => !S.db.some((d) => d.id === l.id));
      miss.forEach((l) => S.db.push({ id: l.id, order: l.order, gw: l.gw, amt: l.amt, st: 'recovered', t: Date.now() }));
      log(miss.length ? `🔁 reconciliation recovered ${miss.length} payment(s)` : '🔁 reconciliation: everything matches'); paint();
    },
    live: () => {
      const b = q('#liveBtn');
      if (liveT) { clearInterval(liveT); liveT = 0; b.textContent = 'Start live traffic'; return; }
      liveN = 0; b.textContent = 'Stop live traffic';
      liveT = window.setInterval(async () => {
        if (!inView) return;
        if (++liveN > 40) { acts.live(); return; }
        const m = mk(GWS[Math.floor(Math.random() * 3)], [500, 1200, 1500, 2500, 5000][Math.floor(Math.random() * 5)]);
        if (Math.random() < 0.25) await verify(m.body, rnd(32)); else await verify(m.body, await sign(m.body));
        S.ledger = S.ledger.slice(-60); paint();
      }, 1600);
    },
    trace: async () => {
      const t = q('#aT'), d = q('#aD');
      for (const [k, cap] of TRACE) {
        root.querySelectorAll('.nd').forEach((n) => n.classList.toggle('hot', (n as HTMLElement).dataset.n === k));
        t.textContent = cap; d.textContent = NODES[k][4]; await sleep(MOTION ? 900 : 300);
      }
      root.querySelectorAll('.nd').forEach((n) => n.classList.remove('hot'));
    },
  };

  const ask: Record<string, () => Promise<void>> = {
    status: async () => {
      await say('me', 'Payment status'); const last = S.db[S.db.length - 1], un = S.ledger.filter((l) => !S.db.some((d) => d.id === l.id));
      if (un.length) await say('bot', `⏳ I can see ${inr(un[un.length - 1].amt)} captured at the gateway but not confirmed yet. Reconciliation will confirm it.`, 500);
      else await say('bot', `✅ Your last payment: ${inr(last.amt)} via ${last.gw}, ref ${last.id}. Status: ${last.st}.`, 500);
    },
    receipt: async () => { await say('me', 'Receipt'); const l = S.db[S.db.length - 1]; await say('bot', `🧾 Receipt<br>${l.id}<br>${inr(l.amt)} · ${l.gw}<br>${tm(l.t)}`, 500); },
    link: async () => {
      await say('me', 'Login link'); S.tok = { v: rnd(10), exp: Date.now() + 600000, used: false };
      await say('bot', `Here is your one-time login link (valid 10 min):<br><button class="chip" data-q="open">platform.example/login?t=${S.tok.v.slice(0, 8)}…</button>`, 500);
    },
    open: async () => {
      const t = S.tok;
      if (!t) return; if (t.used) return say('sys', '❌ This link was already used. Ask for a new one.');
      if (Date.now() > t.exp) return say('sys', '❌ This link has expired.');
      t.used = true; await say('sys', '🔓 Logged in. The link is now dead — tap it again to see.');
    },
  };
  ask.status();

  root.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-tab],[data-act],[data-gw],[data-q],.nd');
    if (!el) return;
    if (el.dataset.tab) {
      root.querySelectorAll('.lab-tab').forEach((x) => x.classList.toggle('on', x === el));
      root.querySelectorAll('.lab-pane').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.pane === el.dataset.tab));
      paint();
    } else if (el.dataset.gw) { gw = el.dataset.gw; root.querySelectorAll('#gwChips .chip').forEach((x) => x.classList.toggle('on', x === el)); }
    else if (el.dataset.act) { const b = el as HTMLButtonElement; b.disabled = true; Promise.resolve(acts[el.dataset.act]()).finally(() => (b.disabled = false)); }
    else if (el.dataset.q) ask[el.dataset.q]();
    else if (el.dataset.n) { const n = NODES[el.dataset.n]; q('#aT').textContent = n[2] + ' · ' + n[3]; q('#aD').textContent = n[4]; root.querySelectorAll('.nd').forEach((x) => x.classList.toggle('hot', x === el)); }
  });
  root.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && (e.target as HTMLElement).classList.contains('nd')) { e.preventDefault(); (e.target as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
  paint();
}
