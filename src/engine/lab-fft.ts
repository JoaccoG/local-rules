

import { DirectConv, FFTConv } from './fft';
import { initGPU } from './gpu';
import { buildKernel } from './lenia';
import { randU32CPU } from './rules';
import { ORBIUM_PARAMS } from './orbium';

const $ = <T extends HTMLElement>(s: string) => document.querySelector<T>(s)!;
const q = new URLSearchParams(location.search);
const N = Number(q.get('n') ?? 256);

let device: GPUDevice | null = null;
let fft: FFTConv | null = null;
let direct: DirectConv | null = null;
let field: GPUBuffer | null = null;
let uF: GPUBuffer | null = null;
let uD: GPUBuffer | null = null;
let read: GPUBuffer | null = null;

async function boot(): Promise<void> {
  const gpu = await initGPU(() => {
    $('#adapter').textContent = 'device lost';
  });
  if (!gpu) {
    $('#adapter').textContent = 'WebGPU unavailable in this browser';
    return;
  }
  $('#adapter').textContent = gpu.adapterInfo;
  $('#n').textContent = `${N}²`;
  device = gpu.device;
  device.onuncapturederror = (e) => console.error('[webgpu]', (e as GPUUncapturedErrorEvent).error.message);
  fft = new FFTConv(device, N);
  direct = new DirectConv(device, N, N);
  const bytes = N * N * 4;
  const mk = (usage: number) => device!.createBuffer({ size: bytes, usage });
  field = mk(GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST);
  uF = mk(GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
  uD = mk(GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
  read = mk(GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);

  const f = new Float32Array(N * N);
  for (let i = 0; i < f.length; i++) f[i] = (randU32CPU(i, 0, 7) >>> 8) / 16777216;
  device.queue.writeBuffer(field, 0, f);
}

async function readBack(buf: GPUBuffer): Promise<Float32Array> {
  const enc = device!.createCommandEncoder();
  enc.copyBufferToBuffer(buf, 0, read!, 0, N * N * 4);
  device!.queue.submit([enc.finish()]);
  await read!.mapAsync(GPUMapMode.READ);
  const out = new Float32Array(read!.getMappedRange().slice(0));
  read!.unmap();
  return out;
}

async function parityAt(R: number): Promise<number> {
  const k = buildKernel(R, ORBIUM_PARAMS.betas);
  fft!.setKernel(k, R);
  direct!.setKernel(k, R);
  const enc = device!.createCommandEncoder();
  fft!.encode(enc, field!, uF!);
  direct!.encode(enc, field!, uD!);
  device!.queue.submit([enc.finish()]);
  const a = await readBack(uF!);
  const b = await readBack(uD!);
  let worst = 0;
  for (let i = 0; i < a.length; i++) worst = Math.max(worst, Math.abs(a[i]! - b[i]!));
  return worst;
}

async function runParity(): Promise<{ r13: number; r26: number }> {
  const r13 = await parityAt(13);
  const r26 = await parityAt(26);
  $('#out').textContent = `parity vs direct convolution (${N}², deterministic soup)\nR=13  max |Δ| ${r13.toExponential(2)}\nR=26  max |Δ| ${r26.toExponential(2)}`;
  return { r13, r26 };
}

async function time(encodeOne: (enc: GPUCommandEncoder) => void, msBudget = 1200): Promise<number> {
  const batch = (m: number) => {
    const enc = device!.createCommandEncoder();
    for (let i = 0; i < m; i++) encodeOne(enc);
    device!.queue.submit([enc.finish()]);
    return device!.queue.onSubmittedWorkDone();
  };
  await batch(3);

  let t0 = performance.now();
  await batch(10);
  const per = (performance.now() - t0) / 10;
  const m = Math.max(4, Math.round(100 / Math.max(per, 0.05)));
  let done = 0;
  t0 = performance.now();
  let el = 0;
  while (el < msBudget) {
    await batch(m);
    done += m;
    el = performance.now() - t0;
  }
  return el / done;
}

async function runBench(
  radii: number[] = [4, 8, 13, 16, 20, 26, 32, 48, 64],
): Promise<{ n: number; fftMs: number; rows: { R: number; directMs: number }[] }> {
  const kAny = buildKernel(13, ORBIUM_PARAMS.betas);
  fft!.setKernel(kAny, 13);
  const fftMs = await time((enc) => fft!.encode(enc, field!, uF!));
  const rows: { R: number; directMs: number }[] = [];
  const lines: string[] = [
    `crossover bench — ${N}², ms per convolution (CPU wall clock, batched sync)`,
    `FFT (radius-independent): ${fftMs.toFixed(3)} ms`,
    '',
  ];
  $('#out').textContent = lines.join('\n');
  for (const R of radii) {
    const k = buildKernel(R, ORBIUM_PARAMS.betas);
    direct!.setKernel(k, R);
    const directMs = await time((enc) => direct!.encode(enc, field!, uD!));
    rows.push({ R, directMs });
    lines.push(`direct R=${String(R).padStart(2)}  ${directMs.toFixed(3)} ms  ${directMs > fftMs ? '← FFT wins' : ''}`);
    $('#out').textContent = lines.join('\n');
  }
  return { n: N, fftMs, rows };
}

$('#parity').addEventListener('click', () => void runParity());
$('#bench').addEventListener('click', () => void runBench());
void boot();

(window as unknown as Record<string, unknown>).__LAB_FFT = {
  ready: () => !!fft,
  runParity,
  runBench,
};
