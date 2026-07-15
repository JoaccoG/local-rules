

import { initGPU } from './gpu';
import { boscoAt, LtLEngine } from './ltl';
import { hashPairCPU, randU32CPU } from './rules';

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const canvas = $('#sim') as unknown as HTMLCanvasElement;
const q = new URLSearchParams(location.search);

let engine: LtLEngine | null = null;
const GRID = Number(q.get('grid') ?? 192);

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

  engine = new LtLEngine(gpu.device, canvas, GRID, GRID, Number(q.get('seed') ?? 7), {
    r: Number(q.get('r') ?? 5),
    blobs: Number(q.get('blobs') ?? 7),
  });

  if (q.has('rulecheck')) {
    await runRuleCheck(engine);
    return;
  }
  loop();
}

const times: number[] = [];
let last = performance.now();
let acc = 0;
const stepsPerSec = Number(q.get('speed') ?? 9);
function loop(): void {
  requestAnimationFrame(loop);
  if (!engine) return;
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.1);
  times.push(now - last);
  last = now;
  if (times.length > 60) times.shift();
  acc += dt * stepsPerSec;
  const steps = Math.floor(acc);
  acc -= steps;
  engine.tick(Math.min(steps, 8));
  if (engine.frame % 15 === 0) {
    $('#step').textContent = String(engine.frame);
    $('#alive').textContent = engine.stats.alive.toLocaleString('en-US');
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
  if (g && engine) engine.setBrush(g.x, g.y, engine.w / 16, erase ? 0 : 1);
});
canvas.addEventListener('pointermove', (e) => {
  if (!painting) return;
  const g = toGrid(e);
  if (g && engine) engine.setBrush(g.x, g.y, engine.w / 16, erase ? 0 : 1);
});
const stopPaint = () => {
  painting = false;
  engine?.clearBrush();
};
canvas.addEventListener('pointerup', stopPaint);
canvas.addEventListener('pointercancel', stopPaint);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
$('#reseed').addEventListener('click', () => engine?.reseed());

function cpuSeed(W: number, seed: number, blobs: number, r: number): Float32Array {
  const out = new Float32Array(W * W);
  const rad = 2.6 * r;
  const centers: [number, number][] = [];
  for (let b = 0; b < blobs; b++) {
    centers.push([
      hashPairCPU(seed, 0xb10b00 + b * 2) % W,
      hashPairCPU(seed, 0xb10b01 + b * 2) % W,
    ]);
  }
  const td = (a: number, b: number, span: number) => {
    const d = Math.abs(a - b);
    return Math.min(d, span - d);
  };
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      let inside = false;
      for (const [cx, cy] of centers) {
        const dx = td(x, cx, W);
        const dy = td(y, cy, W);
        if (dx * dx + dy * dy < rad * rad) inside = true;
      }
      if (inside) out[y * W + x] = randU32CPU(y * W + x, 0, seed) >>> 0 < 0x80000000 ? 1 : 0;
    }
  }
  return out;
}

function cpuStep(cur: Float32Array, next: Float32Array, W: number, r: number): void {
  const { bLo, bHi, sLo, sHi } = boscoAt(r);
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yi = (y + dy + W) % W;
        for (let dx = -r; dx <= r; dx++) {
          n += cur[yi * W + ((x + dx + W) % W)]!;
        }
      }
      const alive = cur[y * W + x]! > 0.5;
      next[y * W + x] = alive ? (n >= sLo && n <= sHi ? 1 : 0) : (n >= bLo && n <= bHi ? 1 : 0);
    }
  }
}

async function runRuleCheck(eng: LtLEngine): Promise<void> {
  const W = eng.w;
  const results: string[] = [];
  let pass = true;
  for (const r of [5, 3]) {
    eng.setRadius(r);
    eng.reseed(7);
    let state = await eng.readState();
    const ref = cpuSeed(W, eng.seed, 7, r);
    let seedBad = 0;
    for (let i = 0; i < ref.length; i++) if (state[i] !== ref[i]) seedBad++;
    const cur = Float32Array.from(ref);
    const next = new Float32Array(W * W);
    let stepBad = 0;
    for (let s = 0; s < 8; s++) {
      eng.tick(1);
      cpuStep(cur, next, W, r);
      cur.set(next);
      state = await eng.readState();
      for (let i = 0; i < cur.length; i++) if (state[i] !== cur[i]) stepBad++;
    }
    if (seedBad > 0 || stepBad > 0) pass = false;
    results.push(`R${r}: seed ${seedBad} · step ${stepBad}`);
  }
  $('#parity').innerHTML = `rulecheck <b>${pass ? 'PASS' : 'FAIL'}</b> · ${results.join(' · ')}`;
  (window as unknown as Record<string, unknown>).__LTL_CHECK = { pass, results };
  console.log('[ltl rulecheck]', pass ? 'PASS' : 'FAIL', results);
}

(window as unknown as Record<string, unknown>).__LAB_LTL = { getEngine: () => engine };

void boot();
