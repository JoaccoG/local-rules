

import { chromium } from 'playwright';
import { createServer } from 'vite';

const names = process.argv.slice(2);

const TARGET_PX: Record<string, number> = {
  butterfly: 800, heart: 1100, lizard: 944, mushroom: 1607,
  star: 1010, alien: 1682, ghost: 1564, flower: 1192,
};
const PORT = 5196;
const server = await createServer({ server: { port: PORT, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-webgpu'] });
const page = await browser.newPage();
await page.addInitScript('window.__name = (f) => f;');
page.on('pageerror', (e) => console.error('[page error]', e.message));
await page.goto(`http://localhost:${PORT}/lab.html?mode=fft`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => (window as any).__LAB_FFT?.ready(), { timeout: 30_000 });

for (const name of names) {
  const r = await page.evaluate(async (name: string) => {
    const { initGPU } = await import('/src/engine/gpu.ts');
    const { loadNCA } = await import('/src/engine/nca.ts');
    const gpu = await initGPU(() => {});
    if (!gpu) return { error: 'no webgpu' };
    const eng = await loadNCA(gpu.device, null, name, 1, { overlay: true, grid: 160 });
    const CH = 16;
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
    const count = (a: Uint8Array) => a.reduce((s, v) => s + v, 0);
    eng.tick(0);
    for (let t = 0; t < 250; t += 25) eng.tick(25);
    const a250 = await mask();
    for (let t = 250; t < 1200; t += 50) eng.tick(50);
    const a1200 = await mask();

    const L = 64 / 160;
    eng.setBrush(((0.3 * L + 1) / 2) * eng.w, ((1 - 0.16 * L) / 2) * eng.h, 0.22 * eng.w * L);
    eng.tick(2);
    eng.clearBrush();
    const wounded = await mask();
    for (let t = 0; t < 400; t += 50) eng.tick(50);
    const healed = await mask();
    const out = {
      grow: count(a250),
      persistRatio: count(a1200) / Math.max(1, count(a250)),
      persistIoU: iou(a1200, a250),
      woundDrop: 1 - count(wounded) / Math.max(1, count(a1200)),
      healIoU: iou(healed, a1200),
    };
    eng.dispose();
    return out;
  }, name);
  const tpx = TARGET_PX[name] ?? 1000;
  const ok =
    !('error' in r) &&
    r.grow > 300 &&
    r.grow <= 2.5 * tpx &&
    r.persistRatio >= 0.75 && r.persistRatio <= 1.35 &&
    r.persistIoU >= 0.7 &&
    r.healIoU >= 0.7;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(10)} ${JSON.stringify(r)}`);
}
await browser.close();
await server.close();
