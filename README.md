# Krupal's Portfolio

An original, flashy, interactive portfolio for Sai Krupal Kusanapelli —
TypeScript + Vite + Three.js + CSS, hosted free on GitHub Pages.

## The showpiece

**The Verification Pipeline** — a full-viewport Three.js hero scene dramatizing
the real story behind the Student Platform: students pay via UPI, a webhook
verifies every payment, fake receipts get rejected.

- Five glowing geometric nodes: STUDENT → UPI → WEBHOOK → DATABASE → ADMIN,
  linked by a luminous tube, floating in a starfield with mouse-parallax camera.
- **"Verify a payment"** button (or click the Student node): a green pulse
  travels the pipeline; the Admin node flashes and the verified counter ticks up.
- Every ~7s a red **fake-receipt** pulse spawns on its own; the Webhook node
  rejects it in a shard burst and the fakes-blocked counter ticks up.
- Counters are labeled "Illustrative demo, not live platform data."
- Respects `prefers-reduced-motion`; pauses when the tab is hidden.

## Run

Requires Node.js 20.19+ or 22.12+.

```
npm ci
npm run dev     # http://127.0.0.1:5173
npm run build   # outputs dist/
```

## Deploy

`dist/` is pushed to the `gh-pages` branch of `krupalsai/krupal-sai-portfolio`;
GitHub Pages serves it at https://krupalsai.github.io/krupal-sai-portfolio/.
The workflow in `.github/workflows/deploy-pages.yml` documents the long-term
GitHub Actions pattern (needs the one-time Settings → Pages → Source:
GitHub Actions flip if adopted).

## Honesty rules for this site

- Only real work: the Student Platform, Query Agent, FeeDesk AI, voice infra.
- AI-assisted framing: Krupal owns integration, testing, deployment and live ops.
- No phone number, no invented metrics, no fake testimonials, no pretend forms.
