import { configureCanvas, createBuffer, PCG_WGSL } from './gpu';

export const LENIA_R_MAX = 26;

const KSIDE_MAX = 2 * LENIA_R_MAX + 1;

const STEP_WGSL =  `
${PCG_WGSL}
struct Params { w: u32, h: u32, seed: u32, mode: u32,
  mu: f32, sigma: f32, dt: f32, r: u32,
  brushX: f32, brushY: f32, brushR: f32, brushV: f32,
  fade: f32, time: f32, pad0: f32, pad1: f32 }
@group(0) @binding(0) var<storage, read> src: array<f32>;
@group(0) @binding(1) var<storage, read_write> dst: array<f32>;
@group(0) @binding(2) var<uniform> P: Params;
@group(0) @binding(3) var<storage, read> kern: array<f32>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.w || gid.y >= P.h) { return; }
  let i = gid.y * P.w + gid.x;
  if (P.mode == 1u) {

    dst[i] = f32(randU(i, 0u, P.seed) >> 8u) / 16777216.0;
    return;
  }
  let R = i32(P.r);
  let side = 2 * R + 1;
  let W = i32(P.w); let H = i32(P.h);
  let x = i32(gid.x); let y = i32(gid.y);
  var u = 0.0;
  for (var dy = -R; dy <= R; dy++) {
    let yi = u32((y + dy + H) % H);
    for (var dx = -R; dx <= R; dx++) {
      let xi = u32((x + dx + W) % W);
      u += kern[u32((dy + R) * side + (dx + R))] * src[yi * P.w + xi];
    }
  }

  let d = (u - P.mu) / P.sigma;
  let g = 2.0 * exp(-0.5 * d * d) - 1.0;
  var next = clamp(src[i] + P.dt * g, 0.0, 1.0);

  if (P.brushR > 0.0) {
    let bd = distance(vec2f(f32(gid.x), f32(gid.y)), vec2f(P.brushX, P.brushY));
    if (bd < P.brushR) {
      let soft = 1.0 - smoothstep(0.0, P.brushR, bd);
      next = clamp(mix(next, P.brushV, soft * 0.85), 0.0, 1.0);
    }
  }
  dst[i] = next;
}
`;

const RENDER_WGSL = (overlay: boolean) =>  `
${PCG_WGSL}
struct Params { w: u32, h: u32, seed: u32, mode: u32,
  mu: f32, sigma: f32, dt: f32, r: u32,
  brushX: f32, brushY: f32, brushR: f32, brushV: f32,
  fade: f32, time: f32, pad0: f32, pad1: f32 }
@group(0) @binding(0) var<storage, read> state: array<f32>;
@group(0) @binding(2) var<uniform> P: Params;

struct VSOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f }
@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var quad = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  var o: VSOut;
  o.pos = vec4f(quad[vi], 0.0, 1.0);
  o.uv = quad[vi] * 0.5 + 0.5;
  return o;
}

fn cell(x: i32, y: i32) -> f32 {
  let xi = u32((x + i32(P.w)) % i32(P.w));
  let yi = u32((y + i32(P.h)) % i32(P.h));
  return state[yi * P.w + xi];
}

fn sampBL(p: vec2f) -> f32 {
  let f = floor(p - 0.5);
  let t = (p - 0.5) - f;
  let x = i32(f.x); let y = i32(f.y);
  let a = mix(cell(x, y), cell(x + 1, y), t.x);
  let b = mix(cell(x, y + 1), cell(x + 1, y + 1), t.x);
  return mix(a, b, t.y);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let g = vec2f(in.uv.x, 1.0 - in.uv.y) * vec2f(f32(P.w), f32(P.h));
  let v = sampBL(g);

  let e = 1.4;
  let dx = sampBL(g + vec2f(e, 0.0)) - sampBL(g - vec2f(e, 0.0));
  let dy = sampBL(g + vec2f(0.0, e)) - sampBL(g - vec2f(0.0, e));
  let n = normalize(vec3f(-dx * 1.6, -dy * 1.6, 0.28));
  let t = P.time;
  let L = normalize(vec3f(cos(t * 0.3), sin(t * 0.27), 0.75));
  let diff = max(dot(n, L), 0.0) * 0.55;
  let spec = pow(max(dot(reflect(-L, n), vec3f(0.0, 0.0, 1.0)), 0.0), 26.0);
  let accent = vec3f(0.169, 1.0, 0.690);
  var col = (accent * (v * 0.62 + diff * v) + vec3f(0.85, 1.0, 0.95) * spec * v
    + accent * pow(v, 3.0) * 0.30) * 1.35;
  ${
    overlay
      ? `let a = clamp(smoothstep(0.02, 0.35, v) * 0.92, 0.0, 1.0) * P.fade;
  col = vec3f(1.0) - exp(-col * 1.2);
  let gr = (rand01(u32(g.y) * P.w + u32(g.x), u32(P.time * 60.0), P.seed ^ 0x2bffb0u) - 0.5) * 0.028;
  col = max(col + vec3f(gr * a), vec3f(0.0));
  return vec4f(col * a, a);`
      : `let ink = vec3f(0.047, 0.051, 0.094);
  col = vec3f(1.0) - exp(-col * 1.2);
  return vec4f(mix(ink, col, smoothstep(0.01, 0.3, v)), 1.0);`
  }
}
`;

const REDUCE_WGSL =  `
@group(0) @binding(0) var<storage, read> state: array<f32>;
@group(0) @binding(1) var<storage, read_write> partial: array<f32>;
var<workgroup> sh: array<f32, 256>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
  let n = arrayLength(&state);
  let stride = 256u * 64u;
  var acc = 0.0;
  var i = gid.x;
  while (i < n) { acc += state[i]; i += stride; }
  sh[lid.x] = acc;
  workgroupBarrier();
  var s = 128u;
  while (s > 0u) {
    if (lid.x < s) { sh[lid.x] += sh[lid.x + s]; }
    workgroupBarrier();
    s = s >> 1u;
  }
  if (lid.x == 0u) { partial[wid.x] = sh[0]; }
}
`;

export function kernelCore(q: number): number {
  if (q <= 0 || q >= 1) return 0;
  return Math.exp(4 - 1 / (q * (1 - q)));
}

export function buildKernel(R: number, betas: number[]): Float32Array {
  const side = 2 * R + 1;
  const k = new Float32Array(side * side);
  const B = betas.length;
  let sum = 0;
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      const q = Math.sqrt(dx * dx + dy * dy) / R;
      if (q >= 1 || (dx === 0 && dy === 0 && B === 1 && R === 1)) continue;
      const br = q * B;
      const ring = Math.min(Math.floor(br), B - 1);
      const w = (betas[ring] ?? 0) * kernelCore(br - ring);
      k[(dy + R) * side + (dx + R)] = w;
      sum += w;
    }
  }
  if (sum > 0) for (let i = 0; i < k.length; i++) k[i] = k[i]! / sum;
  return k;
}

export interface LeniaStats {
  mass: number;
  frame: number;
}

export class LeniaEngine {
  private device: GPUDevice;
  private ctx: GPUCanvasContext;
  private bufA: GPUBuffer;
  private bufB: GPUBuffer;
  private params: GPUBuffer;
  private kernBuf: GPUBuffer;
  private partial: GPUBuffer;
  private partialRead: GPUBuffer;
  private stepPipe: GPUComputePipeline;
  private renderPipe: GPURenderPipeline;
  private reducePipe: GPUComputePipeline;
  private groups: [GPUBindGroup, GPUBindGroup];
  private renderGroups: [GPUBindGroup, GPUBindGroup];
  private reduceGroups: [GPUBindGroup, GPUBindGroup];
  private flip = 0;
  frame = 0;
  private statPending = false;
  stats: LeniaStats = { mass: 0, frame: 0 };
  mu = 0.15;
  sigma = 0.015;
  dt = 0.1;
  private r = 13;
  private betas: number[] = [1];
  private brush = { x: -1, y: -1, r: 0, v: 1 };
  private fade = 1;
  private time = 0;
  private viewport: [number, number, number, number] | null = null;
  private readonly overlay: boolean;

  constructor(
    device: GPUDevice,
    canvas: HTMLCanvasElement,
    readonly w: number,
    readonly h: number,
    readonly seed: number,
    opts: { overlay?: boolean } = {},
  ) {
    this.device = device;
    this.overlay = !!opts.overlay;
    this.ctx = configureCanvas(device, canvas, this.overlay ? 'premultiplied' : 'opaque');
    const n = w * h;
    const stateUsage =
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    this.bufA = createBuffer(device, n * 4, stateUsage);
    this.bufB = createBuffer(device, n * 4, stateUsage);
    this.params = createBuffer(device, 64, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.kernBuf = createBuffer(
      device,
      KSIDE_MAX * KSIDE_MAX * 4,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );
    this.partial = createBuffer(device, 64 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    this.partialRead = createBuffer(
      device,
      64 * 4,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    );
    this.uploadKernel();

    const stepMod = device.createShaderModule({ code: STEP_WGSL });
    const renderMod = device.createShaderModule({ code: RENDER_WGSL(this.overlay) });
    const reduceMod = device.createShaderModule({ code: REDUCE_WGSL });
    this.stepPipe = device.createComputePipeline({
      layout: 'auto',
      compute: { module: stepMod, entryPoint: 'main' },
    });
    this.renderPipe = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: renderMod, entryPoint: 'vs' },
      fragment: {
        module: renderMod,
        entryPoint: 'fs',
        targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }],
      },
      primitive: { topology: 'triangle-list' },
    });
    this.reducePipe = device.createComputePipeline({
      layout: 'auto',
      compute: { module: reduceMod, entryPoint: 'main' },
    });

    const mkStep = (src: GPUBuffer, dst: GPUBuffer) =>
      device.createBindGroup({
        layout: this.stepPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: src } },
          { binding: 1, resource: { buffer: dst } },
          { binding: 2, resource: { buffer: this.params } },
          { binding: 3, resource: { buffer: this.kernBuf } },
        ],
      });
    this.groups = [mkStep(this.bufA, this.bufB), mkStep(this.bufB, this.bufA)];
    const mkRender = (state: GPUBuffer) =>
      device.createBindGroup({
        layout: this.renderPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: state } },
          { binding: 2, resource: { buffer: this.params } },
        ],
      });
    this.renderGroups = [mkRender(this.bufA), mkRender(this.bufB)];
    const mkReduce = (state: GPUBuffer) =>
      device.createBindGroup({
        layout: this.reducePipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: state } },
          { binding: 1, resource: { buffer: this.partial } },
        ],
      });
    this.reduceGroups = [mkReduce(this.bufA), mkReduce(this.bufB)];

  }

  private writeParams(mode: number): void {
    const u = new ArrayBuffer(64);
    const dv = new DataView(u);
    dv.setUint32(0, this.w, true);
    dv.setUint32(4, this.h, true);
    dv.setUint32(8, this.seed >>> 0, true);
    dv.setUint32(12, mode, true);
    dv.setFloat32(16, this.mu, true);
    dv.setFloat32(20, this.sigma, true);
    dv.setFloat32(24, this.dt, true);
    dv.setUint32(28, this.r, true);
    dv.setFloat32(32, this.brush.x, true);
    dv.setFloat32(36, this.brush.y, true);
    dv.setFloat32(40, this.brush.r, true);
    dv.setFloat32(44, this.brush.v, true);
    dv.setFloat32(48, this.fade, true);
    dv.setFloat32(52, this.time, true);
    this.device.queue.writeBuffer(this.params, 0, u);
  }

  private uploadKernel(): void {
    const k = buildKernel(this.r, this.betas);
    this.device.queue.writeBuffer(this.kernBuf, 0, k);
  }

  setKernel(r: number, betas: number[]): void {
    this.r = Math.max(1, Math.min(LENIA_R_MAX, Math.round(r)));
    this.betas = betas.length ? betas.slice() : [1];
    this.uploadKernel();
  }
  getKernel(): { r: number; betas: number[] } {
    return { r: this.r, betas: this.betas.slice() };
  }
  setGrowth(mu: number, sigma: number): void {
    this.mu = mu;
    this.sigma = Math.max(1e-4, sigma);
  }

  setViewport(x: number, y: number, w: number, h: number): void {
    this.viewport = [x, y, w, h];
  }
  setFade(v: number): void {
    this.fade = v;
  }
  setBrush(x: number, y: number, r: number, v: number): void {
    this.brush = { x, y, r, v };
  }
  clearBrush(): void {
    this.brush.r = 0;
  }

  reseedSoup(): void {
    this.writeParams(1);
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.stepPipe);
    pass.setBindGroup(0, this.groups[this.flip ^ 1]!);
    pass.dispatchWorkgroups(Math.ceil(this.w / 16), Math.ceil(this.h / 16));
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  place(patterns: { cells: number[][]; x: number; y: number }[]): void {
    const a = new Float32Array(this.w * this.h);
    for (const p of patterns) {
      for (let r = 0; r < p.cells.length; r++) {
        const row = p.cells[r]!;
        for (let c = 0; c < row.length; c++) {
          const x = (p.x + c + this.w) % this.w;
          const y = (p.y + r + this.h) % this.h;
          a[y * this.w + x] = Math.max(a[y * this.w + x]!, row[c]!);
        }
      }
    }
    this.writeState(a);
    this.frame = 0;

    this.stats = { mass: a.reduce((s, v) => s + v, 0), frame: 0 };
  }

  tick(steps: number): void {
    this.time += 1 / 60;
    this.writeParams(0);
    const enc = this.device.createCommandEncoder();
    for (let s = 0; s < steps; s++) {
      const pass = enc.beginComputePass();
      pass.setPipeline(this.stepPipe);
      pass.setBindGroup(0, this.groups[this.flip]!);
      pass.dispatchWorkgroups(Math.ceil(this.w / 16), Math.ceil(this.h / 16));
      pass.end();
      this.flip ^= 1;
    }
    if (steps > 0 && this.frame % 30 === 0 && !this.statPending) {
      const pass = enc.beginComputePass();
      pass.setPipeline(this.reducePipe);
      pass.setBindGroup(0, this.reduceGroups[this.flip]!);
      pass.dispatchWorkgroups(64);
      pass.end();
      enc.copyBufferToBuffer(this.partial, 0, this.partialRead, 0, 64 * 4);
    }
    const view = this.ctx.getCurrentTexture().createView();
    const rp = enc.beginRenderPass({
      colorAttachments: [
        {
          view,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: this.overlay ? { r: 0, g: 0, b: 0, a: 0 } : { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    rp.setPipeline(this.renderPipe);
    rp.setBindGroup(0, this.renderGroups[this.flip]!);
    if (this.viewport) rp.setViewport(...this.viewport, 0, 1);
    rp.draw(6);
    rp.end();
    this.device.queue.submit([enc.finish()]);

    if (steps > 0 && this.frame % 30 === 0 && !this.statPending) {
      this.statPending = true;
      const frameAt = this.frame;
      this.partialRead
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          const p = new Float32Array(this.partialRead.getMappedRange().slice(0));
          this.partialRead.unmap();
          this.stats = { mass: p.reduce((a, b) => a + b, 0), frame: frameAt };
          this.statPending = false;
        })
        .catch(() => {

          this.statPending = false;
        });
    }
    this.frame++;
  }

  async readState(): Promise<Float32Array> {
    const n = this.w * this.h * 4;
    const staging = this.device.createBuffer({
      size: n,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.flip === 0 ? this.bufA : this.bufB, 0, staging, 0, n);
    this.device.queue.submit([enc.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(staging.getMappedRange().slice(0));
    staging.destroy();
    return out;
  }

  writeState(data: Float32Array): void {
    this.device.queue.writeBuffer(this.flip === 0 ? this.bufA : this.bufB, 0, data);
  }

  dispose(): void {
    this.bufA.destroy();
    this.bufB.destroy();
    this.params.destroy();
    this.kernBuf.destroy();
    this.partial.destroy();
    this.partialRead.destroy();
  }
}
