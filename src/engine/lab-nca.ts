

import { initGPU } from './gpu';
import { loadNCA, NCAEngine } from './nca';

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const canvas = $('#sim') as unknown as HTMLCanvasElement;

let engine: NCAEngine | null = null;
let raf = 0;

async function boot(): Promise<void> {
  const gpu = await initGPU((reason) => {
    $('#adapter').textContent = `device lost (${reason})`;
  });
  if (!gpu) {
    $('#adapter').textContent = 'WebGPU unavailable in this browser';
    return;
  }
  $('#adapter').textContent = gpu.adapterInfo;
  const side = Math.min(innerWidth, innerHeight) * Math.min(devicePixelRatio, 2);
  canvas.width = side;
  canvas.height = side;
  canvas.style.width = canvas.style.height = `${side / Math.min(devicePixelRatio, 2)}px`;
  canvas.style.margin = '0 auto';

  const shape = new URLSearchParams(location.search).get('shape') ?? 'butterfly';
  engine = await loadNCA(gpu.device, canvas, shape, 1);
  const meta = await fetch(`/weights/${shape}.json`).then((r) => r.json());
  $('#params').textContent = meta.params.toLocaleString('en-US');
  $('#bytes').textContent = `${(meta.bytes / 1000).toFixed(1)} kB`;

  if (new URLSearchParams(location.search).has('parity')) {
    await runParity(gpu.device);
    return;
  }
  loop();
}

const times: number[] = [];
let last = performance.now();
function loop(): void {
  raf = requestAnimationFrame(loop);
  if (!engine) return;
  engine.tick(1);
  const now = performance.now();
  times.push(now - last);
  last = now;
  if (times.length > 60) times.shift();
  if (engine.step % 15 === 0) {
    $('#step').textContent = String(engine.step);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    $('#fps').textContent = (1000 / avg).toFixed(0);
  }
}

let cutting = false;
const toGrid = (e: PointerEvent) => {
  if (!engine) return null;
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * engine.w,
    y: ((e.clientY - r.top) / r.height) * engine.h,
  };
};
canvas.addEventListener('pointerdown', (e) => {
  cutting = true;
  canvas.setPointerCapture(e.pointerId);
  const g = toGrid(e);
  if (g && engine) engine.setBrush(g.x, g.y, engine.w / 10);
});
canvas.addEventListener('pointermove', (e) => {
  if (!cutting) return;
  const g = toGrid(e);
  if (g && engine) engine.setBrush(g.x, g.y, engine.w / 10);
});
const stop = () => {
  cutting = false;
  engine?.clearBrush();
};
canvas.addEventListener('pointerup', stop);
canvas.addEventListener('pointercancel', stop);
$('#reseed').addEventListener('click', () => engine?.reset());

async function runParity(_device: GPUDevice): Promise<void> {
  cancelAnimationFrame(raf);
  if (!engine) return;
  const metaP = await fetch('/weights/parity.json').then((r) => r.json());
  const refBuf: ArrayBuffer = await fetch('/weights/parity.bin').then((r) => r.arrayBuffer());
  const ref = new Float32Array(refBuf);
  const per = engine.w * engine.h * 16;
  engine.reset();

  let worst = 0;
  let worstAbs = 0;
  const perStep: number[] = [];
  for (let t = 0; t < metaP.steps; t++) {
    engine.tick(1);
    const got = await engine.readState();
    let m = 0;
    for (let i = 0; i < per; i++) {
      const r = ref[t * per + i]!;
      const dAbs = Math.abs(got[i]! - r);
      const d = dAbs / Math.max(1, Math.abs(r));
      if (d > m) m = d;
      if (dAbs > worstAbs) worstAbs = dAbs;
    }
    perStep.push(m);
    if (m > worst) worst = m;
  }
  const pass = worst <= metaP.tolerance;
  $('#parity').innerHTML =
    `parity <b>${pass ? 'PASS' : 'FAIL'}</b> max norm Δ ${worst.toExponential(2)} · abs ${worstAbs.toExponential(2)} (tol ${metaP.tolerance})`;
  (window as unknown as Record<string, unknown>).__PARITY = { pass, worst, worstAbs, perStep };
  console.log('[parity]', pass ? 'PASS' : 'FAIL', 'norm', worst, 'abs', worstAbs);
}

(window as unknown as Record<string, unknown>).__LAB_NCA = { getEngine: () => engine };

void boot();
