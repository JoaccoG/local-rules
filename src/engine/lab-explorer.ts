

import { densityU32, initGPU } from './gpu';
import { ExplorerEngine, EXPLORER_TILES } from './explorer';
import { explorerRules, formatRule, randU32CPU, ruleName } from './rules';

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const canvas = $('#sim') as unknown as HTMLCanvasElement;
const q = new URLSearchParams(location.search);

let engine: ExplorerEngine | null = null;

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

  const seed = Number(q.get('seed') ?? 7);
  const worlds = Number(q.get('worlds') ?? 0.14);
  const tile = Number(q.get('tile') ?? 32);
  const density = Number(q.get('density') ?? 0.5);
  engine = new ExplorerEngine(gpu.device, canvas, seed, {
    tile,
    density,
    rules: explorerRules(seed, worlds),
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
const stepsPerSec = Number(q.get('speed') ?? 8);
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
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    $('#fps').textContent = (1000 / avg).toFixed(0);
  }
}

canvas.addEventListener('pointermove', (e) => {
  if (!engine) return;
  const r = canvas.getBoundingClientRect();
  const tx = Math.min(EXPLORER_TILES - 1, Math.floor(((e.clientX - r.left) / r.width) * EXPLORER_TILES));
  const ty = Math.min(EXPLORER_TILES - 1, Math.floor(((e.clientY - r.top) / r.height) * EXPLORER_TILES));
  const t = ty * EXPLORER_TILES + tx;
  engine.setHover(t);
  const rule = engine.rules[t]!;
  const name = ruleName(rule);
  const act = ((engine.activity[t]! / (engine.tile * engine.tile)) * 100).toFixed(1);
  $('#rule').textContent = `${formatRule(rule)}${name ? ` · ${name}` : ''} · Δ ${act}%`;
});
canvas.addEventListener('pointerleave', () => {
  engine?.setHover(null);
  $('#rule').textContent = '—';
});
$('#reseed').addEventListener('click', () => engine?.reseed());

function cpuStep(cur: Float32Array, next: Float32Array, tile: number): void {
  const W = tile * EXPLORER_TILES;
  for (let gy = 0; gy < W; gy++) {
    for (let gx = 0; gx < W; gx++) {
      const tX = Math.floor(gx / tile);
      const tY = Math.floor(gy / tile);
      const t = tY * EXPLORER_TILES + tX;
      const rule = engine!.rules[t]!;
      const ox = tX * tile;
      const oy = tY * tile;
      const lx = gx - ox;
      const ly = gy - oy;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const xi = (lx + dx + tile) % tile;
          const yi = (ly + dy + tile) % tile;
          n += cur[(oy + yi) * W + (ox + xi)]!;
        }
      }
      const alive = cur[gy * W + gx]! > 0.5;
      const mask = alive ? rule.survive : rule.birth;
      next[gy * W + gx] = (mask >> n) & 1;
    }
  }
}

async function runRuleCheck(eng: ExplorerEngine): Promise<void> {
  const W = eng.w;
  const tile = eng.tile;

  let state = await eng.readState();

  const densU = densityU32(Number(q.get('density') ?? 0.5));
  let seedBad = 0;
  for (let gy = 0; gy < W; gy++) {
    for (let gx = 0; gx < W; gx++) {
      const local = (gy % tile) * tile + (gx % tile);
      const want = randU32CPU(local, 0, eng.seed) >>> 0 < densU ? 1 : 0;
      if (state[gy * W + gx] !== want) seedBad++;
    }
  }

  const STEPS = 16;
  const cur = Float32Array.from(state);
  const next = new Float32Array(W * W);
  let stepBad = 0;
  let firstBadStep = -1;
  for (let s = 0; s < STEPS; s++) {
    eng.tick(1);
    cpuStep(cur, next, tile);
    cur.set(next);
    state = await eng.readState();
    let bad = 0;
    for (let i = 0; i < W * W; i++) if (state[i] !== cur[i]) bad++;
    if (bad > 0 && firstBadStep < 0) firstBadStep = s + 1;
    stepBad += bad;
  }
  const pass = seedBad === 0 && stepBad === 0;
  $('#parity').innerHTML =
    `rulecheck <b>${pass ? 'PASS' : 'FAIL'}</b> · 64 rules × ${STEPS} steps · ` +
    `seed mismatches ${seedBad} · step mismatches ${stepBad}` +
    (firstBadStep > 0 ? ` (first at step ${firstBadStep})` : '');
  (window as unknown as Record<string, unknown>).__RULECHECK = {
    pass,
    seedBad,
    stepBad,
    firstBadStep,
  };
  console.log('[rulecheck]', pass ? 'PASS' : 'FAIL', { seedBad, stepBad, firstBadStep });
}

(window as unknown as Record<string, unknown>).__LAB_EXPLORER = { getEngine: () => engine };

void boot();
