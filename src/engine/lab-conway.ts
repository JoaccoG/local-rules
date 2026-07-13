

import { initGPU } from './gpu';
import { ConwayEngine } from './conway';
import { formatRule, parseRule, ruleName } from './rules';

const ruleParam = new URLSearchParams(location.search).get('rule');
const labRule = ruleParam ? parseRule(ruleParam) : null;
if (ruleParam && !labRule) console.warn('[lab] unparseable rule', ruleParam);

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const canvas = $('#sim') as unknown as HTMLCanvasElement;

let engine: ConwayEngine | null = null;
let device: Awaited<ReturnType<typeof initGPU>> = null;
let paused = false;
let raf = 0;

async function boot(): Promise<void> {
  device = await initGPU((reason) => {
    $('#adapter').textContent = `device lost (${reason}) — rebuilding`;
    void rebuild();
  });
  if (!device) {
    $('#adapter').textContent = 'WebGPU unavailable in this browser';
    return;
  }
  $('#adapter').textContent = device.adapterInfo;
  await rebuild();
}

async function rebuild(): Promise<void> {
  cancelAnimationFrame(raf);
  engine?.dispose();
  if (!device) return;
  const size = Number(($('#size') as unknown as HTMLSelectElement).value);
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(canvas.clientWidth * dpr);
  canvas.height = Math.round(canvas.clientHeight * dpr);
  engine = new ConwayEngine(
    device.device,
    canvas,
    size,
    size,
    1,
    labRule ? { rule: labRule } : {},
  );
  if (labRule) {
    const label = document.querySelector('.bar span');
    if (label) {
      const name = ruleName(labRule);
      label.textContent = `⌗ ${formatRule(labRule)}${name ? ` · ${name}` : ''} · toroidal · f32 · seed-deterministic`;
    }
  }
  times.length = 0;
  loop();
}

const times: number[] = [];
let last = performance.now();

function loop(): void {
  raf = requestAnimationFrame(loop);
  if (!engine || paused) {
    last = performance.now();
    return;
  }
  const spf = Number(($('#spf') as unknown as HTMLSelectElement).value);
  engine.tick(spf);
  const now = performance.now();
  times.push(now - last);
  last = now;
  if (times.length > 120) times.shift();
  if (engine.frame % 15 === 0 && times.length > 30) {
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const fps = 1000 / avg;
    $('#fps').textContent = fps.toFixed(0);
    $('#ms').textContent = avg.toFixed(2);
    $('#cps').textContent = (engine.w * engine.h * spf * fps).toExponential(2);
    $('#alive').textContent = engine.stats.alive.toLocaleString('en-US');
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
  if (g && engine) engine.setBrush(g.x, g.y, engine.w / 64, erase ? 0 : 1);
});
canvas.addEventListener('pointermove', (e) => {
  if (!painting) return;
  const g = toGrid(e);
  if (g && engine) engine.setBrush(g.x, g.y, engine.w / 64, erase ? 0 : 1);
});
const stopPaint = () => {
  painting = false;
  engine?.clearBrush();
};
canvas.addEventListener('pointerup', stopPaint);
canvas.addEventListener('pointercancel', stopPaint);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

$('#pause').addEventListener('click', () => {
  paused = !paused;
  $('#pause').textContent = paused ? 'resume' : 'pause';
});
$('#reseed').addEventListener('click', () => void rebuild());
($('#size') as unknown as HTMLSelectElement).addEventListener('change', () => void rebuild());
window.addEventListener('resize', () => void rebuild());

(window as unknown as Record<string, unknown>).__LAB = {
  getEngine: () => engine,
  setPaused: (v: boolean) => (paused = v),
};

void boot();
