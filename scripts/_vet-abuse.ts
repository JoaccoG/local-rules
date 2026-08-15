

import { chromium } from 'playwright';
import { createServer } from 'vite';

const names = process.argv.slice(2);
const PORT = 5196;
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu'] });
const page = await browser.newPage();
await page.addInitScript('window.__name = (f) => f;');
page.on('pageerror', (e) => console.error('[page error]', e.message));
await page.goto(`http://localhost:${PORT}/lab.html?mode=fft`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => (window as any).__LAB_FFT?.ready(), { timeout: 30_000 });

for (let ci = 0; ci < names.length; ci++) {
  const name = names[ci]!;
  const r = await page.evaluate(async ({ name, ci }: { name: string; ci: number }) => {
    const { initGPU } = await import('/src/engine/gpu.ts');
    const { loadNCA } = await import('/src/engine/nca.ts');
    const gpu = await initGPU(() => {});
    if (!gpu) return { error: 'no webgpu' };
    const eng = await loadNCA(gpu.device, null, name, 1, { overlay: true, grid: 160 });
    const CH = 16;
    let s = (9000 + ci) >>> 0;
    const rand = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const mask = async () => {
      const st: Float32Array = await eng.readState();
      const m = new Uint8Array(eng.w * eng.h);
      for (let i = 0; i < eng.w * eng.h; i++) if (st[i * CH + 3]! > 0.1) m[i] = 1;
      return m;
    };
    const iou = (a: Uint8Array, b: Uint8Array) => {
      let inter = 0, uni = 0;
      for (let i = 0; i < a.length; i++) {
        if (a[i]! & b[i]!) inter++;
        if (a[i]! | b[i]!) uni++;
      }
      return uni ? inter / uni : 0;
    };
    const count = (a: Uint8Array) => a.reduce((v, w) => v + w, 0);
    for (let t = 0; t < 250; t += 25) eng.tick(25);
    const before = await mask();
    const R = (eng.w * (64 / 160)) / 10;
    for (let round = 0; round < 8; round++) {

      let x1: number, y1: number, x2: number, y2: number;
      if (round % 3 === 2) {
        const c = 56 + rand() * 48;
        if (rand() < 0.5) { x1 = 50; x2 = 110; y1 = y2 = c; }
        else { y1 = 50; y2 = 110; x1 = x2 = c; }
      } else {
        x1 = 56 + rand() * 48; y1 = 56 + rand() * 48;
        x2 = 56 + rand() * 48; y2 = 56 + rand() * 48;
      }

      for (let i = 0; i < 40; i++) {
        const t = i / 39;
        eng.setBrush(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, R);
        eng.tick(4);
      }
      eng.clearBrush();
      for (let t = 0; t < 100; t += 50) eng.tick(50);
    }
    for (let t = 0; t < 600; t += 50) eng.tick(50);
    const after = await mask();
    const out = {
      abuseIoU: iou(after, before),
      massRatio: count(after) / Math.max(1, count(before)),
    };
    eng.dispose();
    return out;
  }, { name, ci });
  console.log(`${name.padEnd(10)} ${JSON.stringify(r)}`);
}
await browser.close();
await server.close();
