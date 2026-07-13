import { configureCanvas, createBuffer, densityU32, PCG_WGSL } from './gpu';
import { explorerRules, type Rule } from './rules';

export const EXPLORER_TILES = 8;

const STEP_WGSL =  `
${PCG_WGSL}
struct Params { w: u32, h: u32, seed: u32, mode: u32,
  density: u32, fade: f32, tile: u32, hover: u32,
  time: f32, glow: f32, pad0: f32, pad1: f32 }
@group(0) @binding(0) var<storage, read> src: array<f32>;
@group(0) @binding(1) var<storage, read_write> dst: array<f32>;
@group(0) @binding(2) var<uniform> P: Params;
@group(0) @binding(3) var<storage, read> rules: array<vec2<u32>, 64>;

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.w || gid.y >= P.h) { return; }
  let i = gid.y * P.w + gid.x;
  let T = P.tile;
  let lx = gid.x % T; let ly = gid.y % T;
  if (P.mode == 1u) {

    dst[i] = select(0.0, 1.0, randU(ly * T + lx, 0u, P.seed) < P.density);
    return;
  }
  let tile = (gid.y / T) * 8u + (gid.x / T);
  let ox = i32((gid.x / T) * T); let oy = i32((gid.y / T) * T);
  let Ti = i32(T);
  var n = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      if (dx == 0 && dy == 0) { continue; }

      let xi = (i32(lx) + dx + Ti) % Ti;
      let yi = (i32(ly) + dy + Ti) % Ti;
      n += src[u32(oy + yi) * P.w + u32(ox + xi)];
    }
  }
  let alive = src[i];
  let r = rules[tile];
  let ni = u32(n + 0.5);
  let mask = select(r.x, r.y, alive > 0.5);
  dst[i] = select(0.0, 1.0, ((mask >> ni) & 1u) == 1u);
}
`;

const RENDER_WGSL = (overlay: boolean) =>  `
${PCG_WGSL}
struct Params { w: u32, h: u32, seed: u32, mode: u32,
  density: u32, fade: f32, tile: u32, hover: u32,
  time: f32, glow: f32, pad0: f32, pad1: f32 }
@group(0) @binding(0) var<storage, read> state: array<f32>;
@group(0) @binding(1) var<storage, read> bright: array<f32>;
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

fn tap(gx: i32, gy: i32, ox: i32, oy: i32, Ti: i32) -> f32 {
  let xi = clamp(gx, ox, ox + Ti - 1);
  let yi = clamp(gy, oy, oy + Ti - 1);
  return state[u32(yi) * P.w + u32(xi)];
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let fx = in.uv.x * f32(P.w);
  let fy = (1.0 - in.uv.y) * f32(P.h);
  let gx = min(u32(fx), P.w - 1u);
  let gy = min(u32(fy), P.h - 1u);
  let T = P.tile;
  let tile = (gy / T) * 8u + (gx / T);
  let v = state[gy * P.w + gx];
  let score = bright[tile];

  let tu = vec2f(fract(fx / f32(T)), fract(fy / f32(T)));
  let bd = min(min(tu.x, 1.0 - tu.x), min(tu.y, 1.0 - tu.y));
  let inn = step(0.035, bd);
  let accent = vec3f(0.545, 0.361, 0.965);

  let b = mix(0.16, 0.82, score);

  let ox = i32((gx / T) * T); let oy = i32((gy / T) * T);
  let xi = i32(gx); let yi = i32(gy);
  var h = 0.0;
  h += tap(xi - 2, yi, ox, oy, i32(T)) + tap(xi + 2, yi, ox, oy, i32(T))
     + tap(xi, yi - 2, ox, oy, i32(T)) + tap(xi, yi + 2, ox, oy, i32(T));
  h += tap(xi - 3, yi - 3, ox, oy, i32(T)) + tap(xi + 3, yi - 3, ox, oy, i32(T))
     + tap(xi - 3, yi + 3, ox, oy, i32(T)) + tap(xi + 3, yi + 3, ox, oy, i32(T));
  let halo = max(h / 8.0 - v * 0.6, 0.0) * score * P.glow;

  let ring = select(0.0, (1.0 - step(0.05, bd)) * 0.5, tile == P.hover);
  let lift = select(1.0, 1.18, tile == P.hover);
  ${
    overlay
      ? `var col = accent * (v * b * lift + halo * 0.55) * inn
    + accent * (1.0 - inn) * 0.05 + accent * ring;
  var a = clamp(v * b * lift * 0.95 + halo * 0.30, 0.0, 1.0) * inn * P.fade
    + (1.0 - inn) * 0.05 * P.fade + ring * P.fade;
  a = clamp(a, 0.0, 1.0);

  col = vec3f(1.0) - exp(-col * 1.2);
  let g = (rand01(gy * P.w + gx, u32(P.time), P.seed ^ 0x5f375a86u) - 0.5) * 0.028;
  col = max(col + vec3f(g * a), vec3f(0.0));
  return vec4f(col * P.fade, a);`
      : `let ink = vec3f(0.047, 0.051, 0.094);
  var col = mix(ink, accent, clamp(v * b * lift + halo * 0.55, 0.0, 1.0));
  col = mix(accent * 0.05, col, inn);
  col = col + accent * ring;
  col = vec3f(1.0) - exp(-col * 1.2);
  return vec4f(col, 1.0);`
  }
}
`;

const ACTIVITY_WGSL =  `
struct Params { w: u32, h: u32, seed: u32, mode: u32,
  density: u32, fade: f32, tile: u32, hover: u32,
  time: f32, glow: f32, pad0: f32, pad1: f32 }
@group(0) @binding(0) var<storage, read> cur: array<f32>;
@group(0) @binding(1) var<storage, read> prev: array<f32>;
@group(0) @binding(2) var<storage, read_write> partial: array<f32>;
@group(0) @binding(3) var<uniform> P: Params;
var<workgroup> sh: array<f32, 256>;
@compute @workgroup_size(256)
fn main(@builtin(local_invocation_id) lid: vec3<u32>,
        @builtin(workgroup_id) wid: vec3<u32>) {
  let T = P.tile;
  let ox = (wid.x % 8u) * T;
  let oy = (wid.x / 8u) * T;
  let cells = T * T;
  var acc = 0.0;
  var k = lid.x;
  while (k < cells) {
    let i = (oy + k / T) * P.w + (ox + k % T);
    acc += abs(cur[i] - prev[i]);
    k += 256u;
  }
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

export class ExplorerEngine {
  private device: GPUDevice;
  private ctx: GPUCanvasContext;
  private bufA: GPUBuffer;
  private bufB: GPUBuffer;
  private params: GPUBuffer;
  private rulesBuf: GPUBuffer;
  private brightBuf: GPUBuffer;
  private partial: GPUBuffer;
  private partialRead: GPUBuffer;
  private stepPipe: GPUComputePipeline;
  private renderPipe: GPURenderPipeline;
  private activityPipe: GPUComputePipeline;
  private groups: [GPUBindGroup, GPUBindGroup];
  private renderGroups: [GPUBindGroup, GPUBindGroup];
  private activityGroups: [GPUBindGroup, GPUBindGroup];
  private flip = 0;
  frame = 0;
  private statPending = false;

  activity = new Float32Array(64);

  private bright = new Float32Array(64);
  private density: number;
  private fade = 1;
  private hover = 0xffff;
  private glow = 1;
  private viewport: [number, number, number, number] | null = null;
  private readonly overlay: boolean;
  readonly tile: number;
  readonly w: number;
  readonly h: number;
  rules: Rule[];

  constructor(
    device: GPUDevice,
    canvas: HTMLCanvasElement,
    readonly seed: number,
    opts: {
      overlay?: boolean;
      density?: number;
      tile?: number;
      rules?: Rule[];
    } = {},
  ) {
    this.device = device;
    this.overlay = !!opts.overlay;
    this.density = opts.density ?? 0.5;
    this.tile = opts.tile ?? 32;
    this.w = this.tile * EXPLORER_TILES;
    this.h = this.tile * EXPLORER_TILES;
    this.rules = opts.rules ?? explorerRules(seed, 0.14);
    this.ctx = configureCanvas(device, canvas, this.overlay ? 'premultiplied' : 'opaque');
    const n = this.w * this.h;
    const stateUsage =
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    this.bufA = createBuffer(device, n * 4, stateUsage);
    this.bufB = createBuffer(device, n * 4, stateUsage);
    this.params = createBuffer(device, 48, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
    this.rulesBuf = createBuffer(
      device,
      64 * 8,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );
    this.brightBuf = createBuffer(
      device,
      64 * 4,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    );
    this.partial = createBuffer(device, 64 * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
    this.partialRead = createBuffer(
      device,
      64 * 4,
      GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    );
    this.writeRules();

    const stepMod = device.createShaderModule({ code: STEP_WGSL });
    const renderMod = device.createShaderModule({ code: RENDER_WGSL(this.overlay) });
    const activityMod = device.createShaderModule({ code: ACTIVITY_WGSL });
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
    this.activityPipe = device.createComputePipeline({
      layout: 'auto',
      compute: { module: activityMod, entryPoint: 'main' },
    });

    const mkStep = (src: GPUBuffer, dst: GPUBuffer) =>
      device.createBindGroup({
        layout: this.stepPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: src } },
          { binding: 1, resource: { buffer: dst } },
          { binding: 2, resource: { buffer: this.params } },
          { binding: 3, resource: { buffer: this.rulesBuf } },
        ],
      });
    this.groups = [mkStep(this.bufA, this.bufB), mkStep(this.bufB, this.bufA)];
    const mkRender = (state: GPUBuffer) =>
      device.createBindGroup({
        layout: this.renderPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: state } },
          { binding: 1, resource: { buffer: this.brightBuf } },
          { binding: 2, resource: { buffer: this.params } },
        ],
      });
    this.renderGroups = [mkRender(this.bufA), mkRender(this.bufB)];
    const mkActivity = (cur: GPUBuffer, prev: GPUBuffer) =>
      device.createBindGroup({
        layout: this.activityPipe.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: cur } },
          { binding: 1, resource: { buffer: prev } },
          { binding: 2, resource: { buffer: this.partial } },
          { binding: 3, resource: { buffer: this.params } },
        ],
      });

    this.activityGroups = [
      mkActivity(this.bufA, this.bufB),
      mkActivity(this.bufB, this.bufA),
    ];

    this.writeParams(1);
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.stepPipe);
    pass.setBindGroup(0, this.groups[0]!);
    pass.dispatchWorkgroups(Math.ceil(this.w / 16), Math.ceil(this.h / 16));
    pass.end();
    device.queue.submit([enc.finish()]);
    this.flip = 1;
  }

  private writeParams(mode: number): void {
    const u = new ArrayBuffer(48);
    const dv = new DataView(u);
    dv.setUint32(0, this.w, true);
    dv.setUint32(4, this.h, true);
    dv.setUint32(8, this.seed >>> 0, true);
    dv.setUint32(12, mode, true);
    dv.setUint32(16, densityU32(this.density), true);
    dv.setFloat32(20, this.fade, true);
    dv.setUint32(24, this.tile, true);
    dv.setUint32(28, this.hover, true);
    dv.setFloat32(32, this.frame, true);
    dv.setFloat32(36, this.glow, true);
    this.device.queue.writeBuffer(this.params, 0, u);
  }

  private writeRules(): void {
    const u = new Uint32Array(128);
    this.rules.forEach((r, t) => {
      u[t * 2] = r.birth;
      u[t * 2 + 1] = r.survive;
    });
    this.device.queue.writeBuffer(this.rulesBuf, 0, u);
  }

  setRules(rules: Rule[]): void {
    this.rules = rules;
    this.writeRules();
  }

  setViewport(x: number, y: number, w: number, h: number): void {
    this.viewport = [x, y, w, h];
  }
  setFade(v: number): void {
    this.fade = v;
  }

  setHover(t: number | null): void {
    this.hover = t === null ? 0xffff : t;
  }
  setGlow(v: number): void {
    this.glow = v;
  }

  reseed(density?: number): void {
    if (density !== undefined) this.density = Math.min(1, Math.max(0, density));
    this.writeParams(1);
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.stepPipe);
    pass.setBindGroup(0, this.groups[this.flip ^ 1]!);
    pass.dispatchWorkgroups(Math.ceil(this.w / 16), Math.ceil(this.h / 16));
    pass.end();
    this.device.queue.submit([enc.finish()]);
    this.bright.fill(0);
  }

  tick(steps: number): void {
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
      pass.setPipeline(this.activityPipe);
      pass.setBindGroup(0, this.activityGroups[this.flip]!);
      pass.dispatchWorkgroups(64);
      pass.end();
      enc.copyBufferToBuffer(this.partial, 0, this.partialRead, 0, 64 * 4);
    }

    const cells = this.tile * this.tile;
    for (let t = 0; t < 64; t++) {
      const f = this.activity[t]! / cells;

      const rise = smooth(0.0015, 0.012, f);
      const fall = 1 - smooth(0.1, 0.32, f);
      const target = rise * fall;
      this.bright[t] = this.bright[t]! + (target - this.bright[t]!) * 0.05;
    }
    this.device.queue.writeBuffer(this.brightBuf, 0, this.bright);
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
      this.partialRead
        .mapAsync(GPUMapMode.READ)
        .then(() => {
          const p = new Float32Array(this.partialRead.getMappedRange().slice(0));
          this.partialRead.unmap();
          this.activity.set(p);
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

  dispose(): void {
    this.bufA.destroy();
    this.bufB.destroy();
    this.params.destroy();
    this.rulesBuf.destroy();
    this.brightBuf.destroy();
    this.partial.destroy();
    this.partialRead.destroy();
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
