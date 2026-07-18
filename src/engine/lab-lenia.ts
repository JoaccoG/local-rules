

import { initGPU } from './gpu';
import { buildKernel, LeniaEngine } from './lenia';
import { randU32CPU } from './rules';
import { ORBIUM_CELLS, ORBIUM_PARAMS } from './orbium';

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const canvas = $('#sim') as unknown as HTMLCanvasElement;
const q = new URLSearchParams(location.search);

let engine: LeniaEngine | null = null;
const GRID = Number(q.get('grid') ?? 256);

function placeOrbium(eng: LeniaEngine): void {
  const cx = Math.floor(eng.w / 2 - ORBIUM_CELLS[0]!.length / 2);
  const cy = Math.floor(eng.h / 2 - ORBIUM_CELLS.length / 2);
  eng.place([{ cells: ORBIUM_CELLS, x: cx, y: cy }]);
}

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

  engine = new LeniaEngine(gpu.device, canvas, GRID, GRID, Number(q.get('seed') ?? 7));
  engine.setGrowth(Number(q.get('mu') ?? ORBIUM_PARAMS.mu), Number(q.get('sigma') ?? ORBIUM_PARAMS.sigma));
  engine.setKernel(Number(q.get('r') ?? ORBIUM_PARAMS.R), ORBIUM_PARAMS.betas);
  if (ORBIUM_CELLS.length) placeOrbium(engine);
  else engine.reseedSoup();

  if (q.has('parity')) {
    await runParity(engine);
    return;
  }
  if (q.has('orbium')) {
    await runOrbiumGate(engine);
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
  engine.tick(1);
  if (engine.frame % 15 === 0) {
    $('#step').textContent = String(engine.frame);
    $('#mass').textContent = engine.stats.mass.toFixed(1);
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
  if (g && engine) engine.setBrush(g.x, g.y, engine.w / 18, erase ? 0 : 1);
});
canvas.addEventListener('pointermove', (e) => {
  if (!painting) return;
  const g = toGrid(e);
  if (g && engine) engine.setBrush(g.x, g.y, engine.w / 18, erase ? 0 : 1);
});
const stopPaint = () => {
  painting = false;
  engine?.clearBrush();
};
canvas.addEventListener('pointerup', stopPaint);
canvas.addEventListener('pointercancel', stopPaint);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
$('#orbium').addEventListener('click', () => engine && placeOrbium(engine));
$('#soup').addEventListener('click', () => engine?.reseedSoup());

function centroid(a: Float32Array, w: number): { x: number; y: number; mass: number } {
  let m = 0;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < a.length; i++) {
    const v = a[i]!;
    if (v <= 0) continue;
    m += v;
    sx += v * (i % w);
    sy += v * Math.floor(i / w);
  }
  return { x: m ? sx / m : 0, y: m ? sy / m : 0, mass: m };
}

async function runOrbiumGate(eng: LeniaEngine): Promise<void> {
  if (!ORBIUM_CELLS.length) {
    $('#parity').textContent = 'orbium gate: NO PATTERN';
    (window as unknown as Record<string, unknown>).__ORBIUM = { pass: false, reason: 'no pattern' };
    return;
  }
  const s0 = await eng.readState();
  const c0 = centroid(s0, eng.w);
  const STEPS = 500;
  for (let s = 0; s < STEPS; s += 10) eng.tick(10);
  const s1 = await eng.readState();
  const c1 = centroid(s1, eng.w);

  const dwrap = (d: number, span: number) => Math.min(Math.abs(d), span - Math.abs(d));
  const disp = Math.hypot(dwrap(c1.x - c0.x, eng.w), dwrap(c1.y - c0.y, eng.h));
  const ratio = c1.mass / c0.mass;
  const alive = ratio > 0.4 && ratio < 2.5;
  const bounded = c1.mass < 0.15 * eng.w * eng.h;
  const glides = disp >= 8;
  const pass = alive && bounded && glides;
  $('#parity').innerHTML =
    `orbium <b>${pass ? 'PASS' : 'FAIL'}</b> · ${STEPS} updates · mass ×${ratio.toFixed(3)} · moved ${disp.toFixed(1)} cells`;
  (window as unknown as Record<string, unknown>).__ORBIUM = { pass, ratio, disp, alive, bounded, glides };
  console.log('[orbium]', pass ? 'PASS' : 'FAIL', { ratio, disp });
}

async function runParity(eng: LeniaEngine): Promise<void> {

  eng.setKernel(5, [1]);
  eng.setGrowth(0.15, 0.017);
  eng.reseedSoup();
  const W = eng.w;
  const fr = Math.fround;
  let cur = Float32Array.from(await eng.readState());

  let seedBad = 0;
  for (let i = 0; i < cur.length; i++) {
    if (cur[i] !== fr((randU32CPU(i, 0, eng.seed) >>> 8) / 16777216)) seedBad++;
  }
  const kern = buildKernel(5, [1]);
  const R = 5;
  const side = 2 * R + 1;
  const STEPS = 10;
  let worst = 0;
  for (let s = 0; s < STEPS; s++) {
    eng.tick(1);
    const next = new Float32Array(W * W);
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        let u = 0;
        for (let dy = -R; dy <= R; dy++) {
          const yi = (y + dy + W) % W;
          for (let dx = -R; dx <= R; dx++) {
            const xi = (x + dx + W) % W;
            u = fr(u + fr(kern[(dy + R) * side + (dx + R)]! * cur[yi * W + xi]!));
          }
        }
        const d = fr((u - eng.mu) / eng.sigma);
        const g = fr(2 * Math.exp(-0.5 * d * d) - 1);
        next[y * W + x] = Math.min(1, Math.max(0, fr(cur[y * W + x]! + fr(eng.dt * g))));
      }
    }
    cur = next;
    const got = await eng.readState();
    for (let i = 0; i < cur.length; i++) {
      const dAbs = Math.abs(got[i]! - cur[i]!);
      const dn = dAbs / Math.max(1, Math.abs(cur[i]!));
      if (dn > worst) worst = dn;
    }
  }
  const TOL = 1e-4;
  const pass = worst <= TOL && seedBad === 0;
  $('#parity').innerHTML =
    `parity <b>${pass ? 'PASS' : 'FAIL'}</b> · seed mismatches ${seedBad} · ${STEPS} updates · worst norm Δ ${worst.toExponential(2)} (tol ${TOL})`;
  (window as unknown as Record<string, unknown>).__LENIA_PARITY = { pass, worst, seedBad };
  console.log('[lenia parity]', pass ? 'PASS' : 'FAIL', worst, 'seedBad', seedBad);
}

(window as unknown as Record<string, unknown>).__LAB_LENIA = { getEngine: () => engine };

void boot();
