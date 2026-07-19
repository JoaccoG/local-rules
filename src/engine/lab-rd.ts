

import { initGPU } from './gpu';
import { RD_DEFAULTS, RDEngine } from './rd';

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const canvas = $('#sim') as unknown as HTMLCanvasElement;
const q = new URLSearchParams(location.search);

let engine: RDEngine | null = null;
const GRID = Number(q.get('grid') ?? 512);

async function boot(): Promise<void> {
  const gpu = await initGPU((reason) => {
    $('#adapter').textContent = `device lost (${reason})`;
  });
  if (!gpu) {
    $('#adapter').textContent = 'WebGPU unavailable in this browser';
    return;
  }
  $('#adapter').textContent = gpu.adapterInfo;
  const dpr = Math.min(devicePixelRatio, 2);
  const css = Math.min(innerWidth, innerHeight * 0.92) * 0.92;
  canvas.width = Math.round(css * dpr);
  canvas.height = Math.round(css * dpr);
  canvas.style.width = canvas.style.height = `${css}px`;

  engine = new RDEngine(gpu.device, canvas, GRID, GRID, Number(q.get('seed') ?? 7));
  engine.setParams(Number(q.get('f') ?? RD_DEFAULTS.F), Number(q.get('k') ?? RD_DEFAULTS.k));

  if (q.has('parity')) {
    await runParity(engine);
    return;
  }
  if (q.has('mitosis')) {
    await runMitosisGate(engine);
    return;
  }
  loop();
}

const times: number[] = [];
let last = performance.now();
function loop(): void {
  requestAnimationFrame(loop);
  if (!engine) return;
  const now = performance.now();
  times.push(now - last);
  last = now;
  if (times.length > 60) times.shift();
  engine.tick(10);
  if (engine.frame % 15 === 0) {
    $('#step').textContent = String(engine.frame);
    $('#mass').textContent = engine.stats.vMass.toFixed(0);
    $('#fv').textContent = engine.F.toFixed(4);
    $('#kv').textContent = engine.k.toFixed(4);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    $('#fps').textContent = (1000 / avg).toFixed(0);
  }
}

let painting = false;
let erase = false;
const toGrid = (e: PointerEvent) => {
  if (!engine) return null;
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * engine.w,
    y: ((e.clientY - r.top) / r.height) * engine.h,
  };
};
canvas.addEventListener('pointerdown', (e) => {
  painting = true;
  erase = e.button === 2 || e.altKey;
  canvas.setPointerCapture(e.pointerId);
  const g = toGrid(e);
  if (g && engine) engine.setBrush(g.x, g.y, engine.w / 60, erase ? 0 : 1);
});
canvas.addEventListener('pointermove', (e) => {
  if (!painting) return;
  const g = toGrid(e);
  if (g && engine) engine.setBrush(g.x, g.y, engine.w / 60, erase ? 0 : 1);
});
const stopPaint = () => {
  painting = false;
  engine?.clearBrush();
};
canvas.addEventListener('pointerup', stopPaint);
canvas.addEventListener('pointercancel', stopPaint);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
$('#reseed').addEventListener('click', () => engine?.reseed());

async function runMitosisGate(eng: RDEngine): Promise<void> {
  const vMassOf = (a: Float32Array) => {
    let m = 0;
    for (let i = 1; i < a.length; i += 2) m += a[i]!;
    return m;
  };

  for (let s = 0; s < 500; s += 25) eng.tick(25);
  const m0 = vMassOf(await eng.readState());
  const STEPS = 3000;
  for (let s = 0; s < STEPS; s += 25) eng.tick(25);
  const m1 = vMassOf(await eng.readState());
  const grew = m1 > 1.5 * m0 && m0 > 1;
  const bounded = m1 < 0.35 * eng.w * eng.h;
  const pass = grew && bounded;
  $('#parity').innerHTML =
    `mitosis <b>${pass ? 'PASS' : 'FAIL'}</b> · ${STEPS} steps after settle · v-mass ×${(m1 / m0).toFixed(2)}`;
  (window as unknown as Record<string, unknown>).__RD_MITOSIS = { pass, ratio: m1 / m0, grew, bounded };
  console.log('[rd mitosis]', pass ? 'PASS' : 'FAIL', m1 / m0);
}

async function runParity(eng: RDEngine): Promise<void> {
  const W = eng.w;
  const fr = Math.fround;
  let cur = Float32Array.from(await eng.readState());
  const { F, k } = eng;
  const { Du, Dv, dt } = RD_DEFAULTS;
  const STEPS = 5;
  let worst = 0;
  const at = (a: Float32Array, x: number, y: number, c: number) => {
    const xi = Math.min(Math.max(x, 0), W - 1);
    const yi = Math.min(Math.max(y, 0), W - 1);
    return a[(yi * W + xi) * 2 + c]!;
  };
  for (let s = 0; s < STEPS; s++) {
    eng.tick(1);
    const next = new Float32Array(W * W * 2);
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        for (let c = 0; c < 2; c++) {

          const ortho = fr(fr(fr(fr(at(cur, x - 1, y, c) + at(cur, x + 1, y, c)) + at(cur, x, y - 1, c)) + at(cur, x, y + 1, c)) * 0.2);
          const diag = fr(fr(fr(fr(at(cur, x - 1, y - 1, c) + at(cur, x + 1, y - 1, c)) + at(cur, x - 1, y + 1, c)) + at(cur, x + 1, y + 1, c)) * 0.05);
          const lap = fr(fr(ortho + diag) - at(cur, x, y, c));
          const u = at(cur, x, y, 0);
          const v = at(cur, x, y, 1);
          const uvv = fr(fr(u * v) * v);
          let val: number;
          if (c === 0) val = fr(u + fr(dt * fr(fr(fr(Du * lap) - uvv) + fr(F * fr(1 - u)))));
          else val = fr(v + fr(dt * fr(fr(fr(Dv * lap) + uvv) - fr(fr(F + k) * v))));
          next[(y * W + x) * 2 + c] = Math.min(1, Math.max(0, val));
        }
      }
    }
    cur = next;
    const got = await eng.readState();
    for (let i = 0; i < cur.length; i++) {
      const dn = Math.abs(got[i]! - cur[i]!) / Math.max(1, Math.abs(cur[i]!));
      if (dn > worst) worst = dn;
    }
  }
  const TOL = 1e-5;
  const pass = worst <= TOL;
  $('#parity').innerHTML =
    `parity <b>${pass ? 'PASS' : 'FAIL'}</b> · ${STEPS} updates · worst norm Δ ${worst.toExponential(2)} (tol ${TOL})`;
  (window as unknown as Record<string, unknown>).__RD_PARITY = { pass, worst };
  console.log('[rd parity]', pass ? 'PASS' : 'FAIL', worst);
}

(window as unknown as Record<string, unknown>).__LAB_RD = { getEngine: () => engine };

void boot();
