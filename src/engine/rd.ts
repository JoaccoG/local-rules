import { configureCanvas, createBuffer, PCG_WGSL } from './gpu';
import { randU32CPU } from './rules';

const STEP_WGSL =  `
struct Params { w: u32, h: u32, seed: u32, mode: u32,
  f: f32, k: f32, du: f32, dv: f32,
  dt: f32, fade: f32, time: f32, brushX: f32,
  brushY: f32, brushR: f32, brushV: f32, pad0: f32 }
@group(0) @binding(0) var<storage, read> src: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> dst: array<vec2f>;
@group(0) @binding(2) var<uniform> P: Params;

fn at(x: i32, y: i32) -> vec2f {

  let xi = u32(clamp(x, 0, i32(P.w) - 1));
  let yi = u32(clamp(y, 0, i32(P.h) - 1));
  return src[yi * P.w + xi];
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.w || gid.y >= P.h) { return; }
  let i = gid.y * P.w + gid.x;
  let x = i32(gid.x); let y = i32(gid.y);
  let c = src[i];

  let lap = (at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1)) * 0.2
    + (at(x - 1, y - 1) + at(x + 1, y - 1) + at(x - 1, y + 1) + at(x + 1, y + 1)) * 0.05
    - c;
  let uvv = c.x * c.y * c.y;
  var u = c.x + P.dt * (P.du * lap.x - uvv + P.f * (1.0 - c.x));
  var v = c.y + P.dt * (P.dv * lap.y + uvv - (P.f + P.k) * c.y);

  if (P.brushR > 0.0) {
    let d = distance(vec2f(f32(gid.x), f32(gid.y)), vec2f(P.brushX, P.brushY));
    if (d < P.brushR) {
      if (P.brushV > 0.5) { v = max(v, 0.9); } else { u = 1.0; v = 0.0; }
    }
  }
  dst[i] = vec2f(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0));
}
`;

const RENDER_WGSL = (overlay: boolean) =>  `
${PCG_WGSL}
struct Params { w: u32, h: u32, seed: u32, mode: u32,
  f: f32, k: f32, du: f32, dv: f32,
  dt: f32, fade: f32, time: f32, brushX: f32,
  brushY: f32, brushR: f32, brushV: f32, pad0: f32 }
@group(0) @binding(0) var<storage, read> state: array<vec2f>;
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

fn cellV(x: i32, y: i32) -> f32 {
  let xi = u32(clamp(x, 0, i32(P.w) - 1));
  let yi = u32(clamp(y, 0, i32(P.h) - 1));
  return state[yi * P.w + xi].y;
}
fn sampBL(p: vec2f) -> f32 {
  let f = floor(p - 0.5);
  let t = (p - 0.5) - f;
  let x = i32(f.x); let y = i32(f.y);
  let a = mix(cellV(x, y), cellV(x + 1, y), t.x);
  let b = mix(cellV(x, y + 1), cellV(x + 1, y + 1), t.x);
  return mix(a, b, t.y);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let g = vec2f(in.uv.x, 1.0 - in.uv.y) * vec2f(f32(P.w), f32(P.h));
  let v = sampBL(g);

  let body = smoothstep(0.06, 0.30, v);
  let e = 1.3;
  let gx = sampBL(g + vec2f(e, 0.0)) - sampBL(g - vec2f(e, 0.0));
  let gy = sampBL(g + vec2f(0.0, e)) - sampBL(g - vec2f(0.0, e));
  let rim = smoothstep(0.015, 0.09, length(vec2f(gx, gy)));
  let accent = vec3f(1.0, 0.886, 0.302);
  var col = accent * (body * 0.5 + rim * 0.30) + vec3f(1.0, 0.97, 0.85) * rim * body * 0.22;
  ${
    overlay
      ? `var a = clamp(body * 0.85 + rim * 0.25 * body, 0.0, 1.0) * P.fade;
  col = vec3f(1.0) - exp(-col * 1.2);
  let gr = (rand01(u32(g.y) * P.w + u32(g.x), u32(P.time * 60.0), P.seed ^ 0xffe24du) - 0.5) * 0.028;
  col = max(col + vec3f(gr * a), vec3f(0.0));
  return vec4f(col * a, a);`
      : `let ink = vec3f(0.047, 0.051, 0.094);
  col = vec3f(1.0) - exp(-col * 1.2);
  return vec4f(mix(ink, col, clamp(body + rim * 0.3, 0.0, 1.0)), 1.0);`
  }
}
`;

const REDUCE_WGSL =  `
@group(0) @binding(0) var<storage, read> state: array<vec2f>;
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
  while (i < n) { acc += state[i].y; i += stride; }
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

export const RD_DEFAULTS = { F: 0.0367, k: 0.0649, Du: 1.0, Dv: 0.5, dt: 1 };

export interface RDStats {
  vMass: number;
  frame: number;
}

export class RDEngine {
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
  stats: RDStats = { vMass: 0, frame: 0 };

  F = RD_DEFAULTS.F;
  k = RD_DEFAULTS.k;
  private targetF = RD_DEFAULTS.F;
  private targetK = RD_DEFAULTS.k;
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
    this.bufA = createBuffer(device, n * 8, stateUsage);
    this.bufB = createBuffer(device, n * 8, stateUsage);
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
    this.reseed();
  }

  private writeParams(): void {
    const u = new ArrayBuffer(64);
    const dv = new DataView(u);
    dv.setUint32(0, this.w, true);
    dv.setUint32(4, this.h, true);
    dv.setUint32(8, this.seed >>> 0, true);
    dv.setUint32(12, 0, true);
    dv.setFloat32(16, this.F, true);
    dv.setFloat32(20, this.k, true);
    dv.setFloat32(24, RD_DEFAULTS.Du, true);
    dv.setFloat32(28, RD_DEFAULTS.Dv, true);
    dv.setFloat32(32, RD_DEFAULTS.dt, true);
    dv.setFloat32(36, this.fade, true);
    dv.setFloat32(40, this.time, true);
    dv.setFloat32(44, this.brush.x, true);
    dv.setFloat32(48, this.brush.y, true);
    dv.setFloat32(52, this.brush.r, true);
    dv.setFloat32(56, this.brush.v, true);
    this.device.queue.writeBuffer(this.params, 0, u);
  }

  setParams(F: number, k: number): void {
    this.targetF = F;
    this.targetK = k;
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

  reseed(spots = 9): void {
    const a = new Float32Array(this.w * this.h * 2);
    for (let i = 0; i < this.w * this.h; i++) a[i * 2] = 1;
    for (let s = 0; s < spots; s++) {
      const cx = 8 + (randU32CPU(s * 2, 1, this.seed) % (this.w - 16));
      const cy = 8 + (randU32CPU(s * 2 + 1, 1, this.seed) % (this.h - 16));
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const x = cx + dx;
          const y = cy + dy;
          if (x < 0 || y < 0 || x >= this.w || y >= this.h) continue;
          a[(y * this.w + x) * 2 + 1] = 1;
        }
      }
    }
    this.writeState(a);
    this.frame = 0;
    this.stats = { vMass: spots * 49, frame: 0 };
  }

  tick(steps: number): void {
    this.time += 1 / 60;

    this.F += (this.targetF - this.F) * 0.045;
    this.k += (this.targetK - this.k) * 0.045;
    this.writeParams();
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
          this.stats = { vMass: p.reduce((a, b) => a + b, 0), frame: frameAt };
          this.statPending = false;
        })
        .catch(() => {

          this.statPending = false;
        });
    }
    this.frame++;
  }

  async readState(): Promise<Float32Array> {
    const n = this.w * this.h * 8;
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
