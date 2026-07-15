import { configureCanvas, createBuffer, PCG_WGSL } from './gpu';

export const BOSCO = { R: 5, bLo: 34, bHi: 45, sLo: 34, sHi: 58, area: 121 };

export function boscoAt(r: number): { bLo: number; bHi: number; sLo: number; sHi: number } {
  const area = (2 * r + 1) ** 2;
  const f = (n: number) => Math.max(1, Math.round((n / BOSCO.area) * area));
  return { bLo: f(BOSCO.bLo), bHi: f(BOSCO.bHi), sLo: f(BOSCO.sLo), sHi: f(BOSCO.sHi) };
}

const STEP_WGSL =  `
${PCG_WGSL}
struct Params { w: u32, h: u32, seed: u32, mode: u32,
  r: u32, bLo: u32, bHi: u32, sLo: u32,
  sHi: u32, blobs: u32, fade: f32, time: f32,
  brushX: f32, brushY: f32, brushR: f32, brushV: f32 }
@group(0) @binding(0) var<storage, read> src: array<f32>;
@group(0) @binding(1) var<storage, read_write> dst: array<f32>;
@group(0) @binding(2) var<uniform> P: Params;

fn tdist(a: f32, b: f32, span: f32) -> f32 {
  let d = abs(a - b);
  return min(d, span - d);
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.w || gid.y >= P.h) { return; }
  let i = gid.y * P.w + gid.x;
  if (P.mode == 1u) {

    let rad = 2.6 * f32(P.r);
    var inside = false;
    for (var b = 0u; b < P.blobs; b++) {
      let cx = f32(pcg(pcg(P.seed) ^ (0xb10b00u + b * 2u)) % P.w);
      let cy = f32(pcg(pcg(P.seed) ^ (0xb10b01u + b * 2u)) % P.h);
      let dx = tdist(f32(gid.x), cx, f32(P.w));
      let dy = tdist(f32(gid.y), cy, f32(P.h));
      if (dx * dx + dy * dy < rad * rad) { inside = true; }
    }
    dst[i] = select(0.0, select(0.0, 1.0, randU(i, 0u, P.seed) < 0x80000000u), inside);
    return;
  }
  let R = i32(P.r);
  let W = i32(P.w); let H = i32(P.h);
  let x = i32(gid.x); let y = i32(gid.y);

  var n = 0u;
  for (var dy = -R; dy <= R; dy++) {
    let yi = u32((y + dy + H) % H);
    for (var dx = -R; dx <= R; dx++) {
      let xi = u32((x + dx + W) % W);
      n += u32(src[yi * P.w + xi] + 0.5);
    }
  }
  let alive = src[i] > 0.5;
  var next = 0.0;
  if (alive) {
    next = select(0.0, 1.0, n >= P.sLo && n <= P.sHi);
  } else {
    next = select(0.0, 1.0, n >= P.bLo && n <= P.bHi);
  }
  if (P.brushR > 0.0) {
    let d = distance(vec2f(f32(gid.x), f32(gid.y)), vec2f(P.brushX, P.brushY));
    if (d < P.brushR) { next = P.brushV; }
  }
  dst[i] = next;
}
`;

const RENDER_WGSL = (overlay: boolean) =>  `
${PCG_WGSL}
struct Params { w: u32, h: u32, seed: u32, mode: u32,
  r: u32, bLo: u32, bHi: u32, sLo: u32,
  sHi: u32, blobs: u32, fade: f32, time: f32,
  brushX: f32, brushY: f32, brushR: f32, brushV: f32 }
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

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let fx = in.uv.x * f32(P.w);
  let fy = (1.0 - in.uv.y) * f32(P.h);
  let gx = i32(min(u32(fx), P.w - 1u));
  let gy = i32(min(u32(fy), P.h - 1u));
  let v = cell(gx, gy);

  var m = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) { m += cell(gx + dx, gy + dy); }
  }
  m /= 9.0;
  let edge = m * (1.0 - m) * 4.0;
  let accent = vec3f(1.0, 0.239, 0.545);

  let gq = vec2f(fract(fx / f32(P.w) * 20.0), fract(fy / f32(P.h) * 20.0));
  let grid = (step(0.95, gq.x) + step(0.95, gq.y)) * 0.05 * (1.0 - m);
  let p = in.uv * 2.0 - 1.0;
  let rfade = smoothstep(1.45, 0.8, length(p));
  var col = accent * (v * 0.38 + edge * 0.85 + grid) * rfade;
  ${
    overlay
      ? `var a = clamp(v * 0.5 + edge * 0.6 + grid, 0.0, 1.0) * rfade * P.fade;
  col = vec3f(1.0) - exp(-col * 1.2);
  let g = (rand01(u32(fy) * P.w + u32(fx), u32(P.time * 60.0), P.seed ^ 0xff3d8bu) - 0.5) * 0.028;
  col = max(col + vec3f(g * a), vec3f(0.0));
  return vec4f(col * P.fade, a);`
      : `let ink = vec3f(0.047, 0.051, 0.094);
  col = vec3f(1.0) - exp(-col * 1.2);
  return vec4f(ink + col, 1.0);`
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

export class LtLEngine {
  private device: GPUDevice;
  private ctx: GPUCanvasContext;
  private bufA: GPUBuffer;
  private bufB: GPUBuffer;
  private params: GPUBuffer;
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
  stats = { alive: 0, frame: 0 };
  r: number;
  private ranges: { bLo: number; bHi: number; sLo: number; sHi: number };
  private blobs: number;
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
    opts: { overlay?: boolean; r?: number; blobs?: number } = {},
  ) {
    this.device = device;
    this.overlay = !!opts.overlay;
    this.r = opts.r ?? BOSCO.R;
    this.blobs = opts.blobs ?? 7;
    this.ranges = boscoAt(this.r);
    this.ctx = configureCanvas(device, canvas, this.overlay ? 'premultiplied' : 'opaque');
    const n = w * h;
    const stateUsage =
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    this.bufA = createBuffer(device, n * 4, stateUsage);
    this.bufB = createBuffer(device, n * 4, stateUsage);
    this.params = createBuffer(device, 64, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.partial = createBuffer(device, 64 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    this.partialRead = createBuffer(
      device,
      64 * 4,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    );

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

    this.writeParams(1);
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.stepPipe);
    pass.setBindGroup(0, this.groups[0]!);
    pass.dispatchWorkgroups(Math.ceil(w / 16), Math.ceil(h / 16));
    pass.end();
    device.queue.submit([enc.finish()]);
    this.flip = 1;
  }

  private writeParams(mode: number): void {
    const u = new ArrayBuffer(64);
    const dv = new DataView(u);
    dv.setUint32(0, this.w, true);
    dv.setUint32(4, this.h, true);
    dv.setUint32(8, this.seed >>> 0, true);
    dv.setUint32(12, mode, true);
    dv.setUint32(16, this.r, true);
    dv.setUint32(20, this.ranges.bLo, true);
    dv.setUint32(24, this.ranges.bHi, true);
    dv.setUint32(28, this.ranges.sLo, true);
    dv.setUint32(32, this.ranges.sHi, true);
    dv.setUint32(36, this.blobs, true);
    dv.setFloat32(40, this.fade, true);
    dv.setFloat32(44, this.time, true);
    dv.setFloat32(48, this.brush.x, true);
    dv.setFloat32(52, this.brush.y, true);
    dv.setFloat32(56, this.brush.r, true);
    dv.setFloat32(60, this.brush.v, true);
    this.device.queue.writeBuffer(this.params, 0, u);
  }

  setRadius(r: number): void {
    this.r = Math.max(1, Math.min(10, Math.round(r)));
    this.ranges = boscoAt(this.r);
  }
  getRanges(): { bLo: number; bHi: number; sLo: number; sHi: number } {
    return { ...this.ranges };
  }

  reseed(blobs?: number): void {
    if (blobs !== undefined) this.blobs = Math.max(1, Math.min(12, Math.round(blobs)));
    this.writeParams(1);
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.stepPipe);
    pass.setBindGroup(0, this.groups[this.flip ^ 1]!);
    pass.dispatchWorkgroups(Math.ceil(this.w / 16), Math.ceil(this.h / 16));
    pass.end();
    this.device.queue.submit([enc.finish()]);
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
          this.stats = { alive: p.reduce((a, b) => a + b, 0), frame: frameAt };
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
    this.partial.destroy();
    this.partialRead.destroy();
  }
}
