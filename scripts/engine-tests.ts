

import { chromium } from 'playwright';
import { createServer } from 'vite';

const PORT = 5199;
const server = await createServer({
  server: { port: PORT, strictPort: true },
  logLevel: 'error',
});
await server.listen();

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--use-webgpu-adapter=swiftshader', '--enable-gpu'],
});
const failures: string[] = [];

function report(name: string, pass: boolean, detail: string): void {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
  if (!pass) failures.push(name);
}

const page = await browser.newPage();

await page.addInitScript('window.__name = (f) => f;');
page.on('pageerror', (err) => console.error(`[page error] ${err.message}`));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.error(`[page] ${msg.text()}`);
});

await page.goto(`http://localhost:${PORT}/lab.html`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => (window as any).__LAB?.getEngine(), { timeout: 30_000 });

await page.evaluate(() => {
  const sel = document.querySelector('#size') as HTMLSelectElement;
  sel.value = '512';
  sel.dispatchEvent(new Event('change'));
});
await page.waitForFunction(() => (window as any).__LAB?.getEngine()?.w === 512);
await page.evaluate(() => (window as any).__LAB.setPaused(true));

const invariants = await page.evaluate(async () => {
  const eng = (window as any).__LAB.getEngine();
  const W = eng.w as number;
  const idx = (x: number, y: number) => y * W + x;
  const empty = () => new Float32Array(W * W);

  const st = empty();
  st[idx(9, 10)] = st[idx(10, 10)] = st[idx(11, 10)] = 1;
  st[idx(30, 30)] = st[idx(31, 30)] = st[idx(30, 31)] = st[idx(31, 31)] = 1;
  eng.writeState(st);
  eng.tick(1);
  const s1 = await eng.readState();
  const alive1 = s1.reduce((a: number, b: number) => a + b, 0);

  const vOK =
    s1[idx(10, 9)] === 1 &&
    s1[idx(10, 10)] === 1 &&
    s1[idx(10, 11)] === 1 &&
    s1[idx(9, 10)] === 0 &&
    s1[idx(11, 10)] === 0;
  const blockOK =
    s1[idx(30, 30)] === 1 && s1[idx(31, 30)] === 1 && s1[idx(30, 31)] === 1 && s1[idx(31, 31)] === 1;
  eng.tick(1);
  const s2 = await eng.readState();
  let periodOK = true;
  for (let i = 0; i < st.length; i++) {
    if (s2[i] !== st[i]) {
      periodOK = false;
      break;
    }
  }
  return { alive1, vOK, blockOK, periodOK };
});
report(
  'conway invariants (bitmask B3/S23)',
  invariants.vOK && invariants.blockOK && invariants.periodOK && invariants.alive1 === 7,
  `census ${invariants.alive1}/7 · flip ${invariants.vOK} · block ${invariants.blockOK} · period-2 ${invariants.periodOK}`,
);

const EXPECTED_MASKS: Record<string, { birth: number; survive: number }> = {
  'B2/S': { birth: 4, survive: 0 },
  'B36/S23': { birth: 72, survive: 12 },
  'B3678/S34678': { birth: 456, survive: 472 },
};
for (const rule of ['B2/S', 'B36/S23', 'B3678/S34678']) {
  await page.goto(`http://localhost:${PORT}/lab.html?rule=${encodeURIComponent(rule)}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => (window as any).__LAB?.getEngine(), { timeout: 30_000 });
  await page.evaluate(() => {
    const sel = document.querySelector('#size') as HTMLSelectElement;
    sel.value = '512';
    sel.dispatchEvent(new Event('change'));
  });
  await page.waitForFunction(() => (window as any).__LAB?.getEngine()?.w === 512);
  await page.evaluate(() => (window as any).__LAB.setPaused(true));
  const res = await page.evaluate(async (ruleStr: string) => {
    const eng = (window as any).__LAB.getEngine();
    const W = eng.w as number;
    const { birth, survive } = eng.getRule();
    const masks = { birth, survive };

    let lcg = 12345;
    const rnd = () => ((lcg = (Math.imul(lcg, 1664525) + 1013904223) >>> 0) / 4294967296);
    const cur = new Float32Array(W * W);
    for (let i = 0; i < cur.length; i++) cur[i] = rnd() < 0.35 ? 1 : 0;
    eng.writeState(cur);
    const next = new Float32Array(W * W);
    let bad = 0;
    for (let s = 0; s < 8; s++) {
      eng.tick(1);
      for (let y = 0; y < W; y++) {
        for (let x = 0; x < W; x++) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx === 0 && dy === 0) continue;
              n += cur[((y + dy + W) % W) * W + ((x + dx + W) % W)];
            }
          }
          const mask = cur[y * W + x] > 0.5 ? survive : birth;
          next[y * W + x] = (mask >> n) & 1;
        }
      }
      cur.set(next);
      const got = await eng.readState();
      for (let i = 0; i < cur.length; i++) if (got[i] !== cur[i]) bad++;
    }
    return { bad, ruleStr, masks };
  }, rule);
  const exp = EXPECTED_MASKS[rule]!;
  const masksOK = res.masks.birth === exp.birth && res.masks.survive === exp.survive;
  report(
    `conway arbitrary rule ${rule}`,
    res.bad === 0 && masksOK,
    `8 steps × 512² · mismatches ${res.bad} · masks ${masksOK ? 'pinned' : `WRONG (got B${res.masks.birth}/S${res.masks.survive})`}`,
  );
}

await page.goto(`http://localhost:${PORT}/lab.html?mode=ltl&rulecheck=1&grid=96`, {
  waitUntil: 'domcontentloaded',
});
const ltl = await page
  .waitForFunction(() => (window as any).__LTL_CHECK, { timeout: 120_000 })
  .then((h) => h.jsonValue() as Promise<{ pass: boolean; results: string[] }>);
report('ltl bosco rulecheck', ltl.pass, `8 gens × 96² × {R5, R3} · ${ltl.results.join(' · ')}`);

await page.goto(`http://localhost:${PORT}/lab.html?mode=lenia&orbium=1`, {
  waitUntil: 'domcontentloaded',
});
const orb = await page
  .waitForFunction(() => (window as any).__ORBIUM, { timeout: 300_000 })
  .then((h) => h.jsonValue() as Promise<{ pass: boolean; ratio?: number; disp?: number; reason?: string }>);
report(
  'lenia orbium stable+glides',
  orb.pass,
  orb.reason ?? `500 updates · mass ×${orb.ratio?.toFixed(3)} · moved ${orb.disp?.toFixed(1)} cells`,
);

await page.goto(`http://localhost:${PORT}/lab.html?mode=lenia&parity=1&grid=64`, {
  waitUntil: 'domcontentloaded',
});
const lp = await page
  .waitForFunction(() => (window as any).__LENIA_PARITY, { timeout: 120_000 })
  .then((h) => h.jsonValue() as Promise<{ pass: boolean; worst: number }>);
report('lenia update-rule parity', lp.pass, `10 updates × 64² · worst norm Δ ${lp.worst.toExponential(2)}`);

await page.goto(`http://localhost:${PORT}/lab.html?mode=rd&mitosis=1&grid=128`, {
  waitUntil: 'domcontentloaded',
});
const rdm = await page
  .waitForFunction(() => (window as any).__RD_MITOSIS, { timeout: 300_000 })
  .then((h) => h.jsonValue() as Promise<{ pass: boolean; ratio: number }>);
report('rd mitosis grows', rdm.pass, `3000 steps post-settle × 128² · v-mass ×${rdm.ratio.toFixed(2)}`);
await page.goto(`http://localhost:${PORT}/lab.html?mode=rd&parity=1&grid=64`, {
  waitUntil: 'domcontentloaded',
});
const rdp = await page
  .waitForFunction(() => (window as any).__RD_PARITY, { timeout: 120_000 })
  .then((h) => h.jsonValue() as Promise<{ pass: boolean; worst: number }>);
report('rd update-rule parity', rdp.pass, `5 updates × 64² · worst norm Δ ${rdp.worst.toExponential(2)}`);

for (const seed of [7, 99]) {
  await page.goto(`http://localhost:${PORT}/lab.html?mode=explorer&rulecheck=1&seed=${seed}`, {
    waitUntil: 'domcontentloaded',
  });
  const rc = await page
    .waitForFunction(() => (window as any).__RULECHECK, { timeout: 120_000 })
    .then((h) => h.jsonValue() as Promise<{ pass: boolean; seedBad: number; stepBad: number }>);
  report(
    `explorer rulecheck seed=${seed}`,
    rc.pass,
    `64 rules × 16 steps · seed mismatches ${rc.seedBad} · step mismatches ${rc.stepBad}`,
  );
}

await page.goto(`http://localhost:${PORT}/lab.html?mode=fft&n=128`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => (window as any).__LAB_FFT?.ready(), { timeout: 30_000 });
const fftParity = await page.evaluate(() => (window as any).__LAB_FFT.runParity());
report(
  'fft convolution parity',
  fftParity.r13 < 2e-4 && fftParity.r26 < 2e-4,
  `128² soup · R=13 Δ ${fftParity.r13.toExponential(2)} · R=26 Δ ${fftParity.r26.toExponential(2)} (tol 2e-4)`,
);

await browser.close();
await server.close();
if (failures.length) {
  console.error(`\n${failures.length} gate(s) FAILED: ${failures.join(', ')}`);
  process.exit(1);
}
console.log('\nall engine gates passed');
