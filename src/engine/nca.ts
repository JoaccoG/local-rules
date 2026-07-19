

import { PCG_WGSL, configureCanvas, createBuffer } from './gpu';

const COMMON =  `
struct Params {
  w: u32, h: u32, seed: u32, step: u32,
  fireRate: f32, alphaThr: f32, brushR: f32, fade: f32,
  brushX: f32, brushY: f32, peel: f32, quadScale: f32,
  time: f32, glow: f32, quadSY: f32, quadOX: f32,
  quadOY: f32, peelK: f32, pad0: f32, pad1: f32,
}
const CH = 16u;
const HID = 128u;
`;

const UPDATE_WGSL =  `
${PCG_WGSL}
${COMMON}
@group(0) @binding(0) var<storage, read> src: array<f32>;
@group(0) @binding(1) var<storage, read_write> mid: array<f32>;
@group(0) @binding(2) var<storage, read_write> preLife: array<f32>;
@group(0) @binding(3) var<storage, read> weights: array<f32>;
@group(0) @binding(4) var<uniform> P: Params;

fn ch_at(x: i32, y: i32, c: u32) -> f32 {
  if (x < 0 || y < 0 || x >= i32(P.w) || y >= i32(P.h)) { return 0.0; }
  return src[(u32(y) * P.w + u32(x)) * CH + c];
}

fn alpha_max3(x: i32, y: i32) -> f32 {
  var m = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) { m = max(m, ch_at(x + dx, y + dy, 3u)); }
  }
  return m;
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.w || gid.y >= P.h) { return; }
  let x = i32(gid.x); let y = i32(gid.y);
  let cell = gid.y * P.w + gid.x;
  preLife[cell] = select(0.0, 1.0, alpha_max3(x, y) > P.alphaThr);

  var p: array<f32, 48>;
  for (var c = 0u; c < CH; c++) {
    let tl = ch_at(x-1, y-1, c); let tc = ch_at(x, y-1, c); let tr = ch_at(x+1, y-1, c);
    let ml = ch_at(x-1, y,   c);  let mc = ch_at(x, y,   c); let mr = ch_at(x+1, y,   c);
    let bl = ch_at(x-1, y+1, c); let bc = ch_at(x, y+1, c); let br = ch_at(x+1, y+1, c);
    p[c * 3u]      = mc;
    p[c * 3u + 1u] = (tr + 2.0*mr + br - tl - 2.0*ml - bl) / 8.0;
    p[c * 3u + 2u] = (bl + 2.0*bc + br - tl - 2.0*tc - tr) / 8.0;
  }

  var hbuf: array<f32, 128>;
  let b1 = 48u * HID;
  for (var j = 0u; j < HID; j++) {
    var acc = weights[b1 + j];
    for (var i = 0u; i < 48u; i++) { acc += p[i] * weights[i * HID + j]; }
    hbuf[j] = max(acc, 0.0);
  }

  let w2 = b1 + HID;
  let b2 = w2 + HID * CH;
  let fire = select(0.0, 1.0, rand01(cell, P.step, P.seed) < P.fireRate);
  for (var c = 0u; c < CH; c++) {
    var d = weights[b2 + c];
    for (var j = 0u; j < HID; j++) { d += hbuf[j] * weights[w2 + j * CH + c]; }
    mid[cell * CH + c] = src[cell * CH + c] + d * fire;
  }
}
`;

const LIFE_WGSL =  `
${COMMON}
@group(0) @binding(0) var<storage, read> mid: array<f32>;
@group(0) @binding(1) var<storage, read_write> dst: array<f32>;
@group(0) @binding(2) var<storage, read> preLife: array<f32>;
@group(0) @binding(4) var<uniform> P: Params;

fn alpha_at(x: i32, y: i32) -> f32 {
  if (x < 0 || y < 0 || x >= i32(P.w) || y >= i32(P.h)) { return 0.0; }
  return mid[(u32(y) * P.w + u32(x)) * CH + 3u];
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.w || gid.y >= P.h) { return; }
  let x = i32(gid.x); let y = i32(gid.y);
  let cell = gid.y * P.w + gid.x;
  var post = 0.0;
  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) { post = max(post, alpha_at(x + dx, y + dy)); }
  }
  var life = select(0.0, 1.0, post > P.alphaThr) * preLife[cell];
  if (P.brushR > 0.0) {
    let d = distance(vec2f(f32(gid.x), f32(gid.y)), vec2f(P.brushX, P.brushY));
    if (d < P.brushR) { life = 0.0; }
  }
  for (var c = 0u; c < CH; c++) { dst[cell * CH + c] = mid[cell * CH + c] * life; }
}
`;

const SEED_WGSL =  `
${COMMON}
@group(0) @binding(1) var<storage, read_write> dst: array<f32>;
@group(0) @binding(4) var<uniform> P: Params;
@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.w || gid.y >= P.h) { return; }
  let cell = gid.y * P.w + gid.x;
  let centre = gid.x == P.w / 2u && gid.y == P.h / 2u;
  for (var c = 0u; c < CH; c++) {
    dst[cell * CH + c] = select(0.0, 1.0, centre && c >= 3u);
  }
}
`;

const RENDER_WGSL = (overlay: boolean) =>  `
${COMMON}
@group(0) @binding(0) var<storage, read> state: array<f32>;
@group(0) @binding(4) var<uniform> P: Params;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
  @location(1) @interpolate(flat) layer: u32,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut {
  var quad = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));

  let layer = 15u - ii;
  var p = quad[vi];
  let peel = P.peel;
  if (layer > 0u && peel < 0.02) {
    var o0: VSOut;
    o0.pos = vec4f(0.0, 0.0, 0.0, 1.0);
    o0.uv = vec2f(0.5);
    o0.layer = layer;
    return o0;
  }

  let squash = 1.0 - 0.26 * peel * P.peelK;
  p.x = p.x * squash;
  p.y = p.y - p.x * 0.14 * peel * P.peelK;
  let L = f32(layer);
  let s = 1.0 - 0.015 * L * peel * P.peelK;
  p = p * s + vec2f(-0.062, 0.014) * L * peel * P.peelK;
  var o: VSOut;
  o.pos = vec4f(p.x * P.quadScale + P.quadOX, p.y * P.quadSY + P.quadOY, 0.0, 1.0);
  o.uv = quad[vi] * 0.5 + 0.5;
  o.layer = layer;
  return o;
}

fn cell(gx: i32, gy: i32, c: u32) -> f32 {
  let x = clamp(gx, 0, i32(P.w) - 1);
  let y = clamp(gy, 0, i32(P.h) - 1);
  return state[(u32(y) * P.w + u32(x)) * CH + c];
}

fn crWeights(t: f32) -> vec4f {
  let t2 = t * t; let t3 = t2 * t;
  return vec4f(
    -0.5 * t3 + t2 - 0.5 * t,
    1.5 * t3 - 2.5 * t2 + 1.0,
    -1.5 * t3 + 2.0 * t2 + 0.5 * t,
    0.5 * t3 - 0.5 * t2);
}

fn sampCR(c: u32, uv: vec2f) -> f32 {
  let fx = uv.x * f32(P.w) - 0.5;
  let fy = (1.0 - uv.y) * f32(P.h) - 0.5;
  let x0 = i32(floor(fx)); let y0 = i32(floor(fy));
  let wx = crWeights(fract(fx)); let wy = crWeights(fract(fy));
  var acc = 0.0;
  for (var j = -1; j <= 2; j++) {
    var row = 0.0;
    for (var i = -1; i <= 2; i++) {
      row += cell(x0 + i, y0 + j, c) * wx[i + 1];
    }
    acc += row * wy[j + 1];
  }
  return acc;
}

fn sampBL(c: u32, uv: vec2f) -> f32 {
  let fx = uv.x * f32(P.w) - 0.5;
  let fy = (1.0 - uv.y) * f32(P.h) - 0.5;
  let x0 = i32(floor(fx)); let y0 = i32(floor(fy));
  let tx = fract(fx); let ty = fract(fy);
  return mix(
    mix(cell(x0, y0, c), cell(x0 + 1, y0, c), tx),
    mix(cell(x0, y0 + 1, c), cell(x0 + 1, y0 + 1, c), tx), ty);
}

fn lad(h0: f32) -> vec3f {
  let h = fract(h0) * 6.0;
  let c0 = vec3f(0.302, 0.882, 1.0);
  let c1 = vec3f(0.545, 0.361, 0.965);
  let c2 = vec3f(1.0, 0.239, 0.545);
  let c3 = vec3f(1.0, 0.478, 0.184);
  let c4 = vec3f(0.169, 1.0, 0.690);
  let c5 = vec3f(1.0, 0.886, 0.302);
  let f = fract(h);
  if (h < 1.0) { return mix(c0, c1, f); }
  if (h < 2.0) { return mix(c1, c2, f); }
  if (h < 3.0) { return mix(c2, c3, f); }
  if (h < 4.0) { return mix(c3, c4, f); }
  if (h < 5.0) { return mix(c4, c5, f); }
  return mix(c5, c0, f);
}

fn hash21(p0: vec2f) -> f32 {
  var p = fract(p0 * vec2f(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let a = clamp(sampCR(3u, in.uv), 0.0, 1.0);
  if (in.layer > 0u) {

    let shape = smoothstep(0.02, 0.25, a);
    var colL: vec3f;
    var alphaL: f32;
    if (in.layer <= 3u) {
      let v = clamp(sampCR(in.layer - 1u, in.uv), 0.0, 1.0);
      let tint = array<vec3f, 3>(
        vec3f(1.0, 0.25, 0.30), vec3f(0.30, 1.0, 0.45), vec3f(0.35, 0.50, 1.0));
      colL = tint[in.layer - 1u] * v;
      alphaL = 0.55;
    } else {
      let v = sampCR(in.layer, in.uv);
      let nv = clamp(v * 0.35, -1.0, 1.0);
      let g = mix(vec3f(0.62, 0.60, 0.85), vec3f(0.35, 0.33, 0.50), fract(f32(in.layer) * 0.618));
      let warm = mix(vec3f(0.45, 0.40, 0.85), vec3f(0.95, 0.70, 0.45), nv * 0.5 + 0.5);
      colL = mix(g, warm, 0.45) * abs(nv);
      alphaL = 0.30;
    }
    let aa = alphaL * P.peel * shape * P.fade;

    return vec4f(colL * aa * 1.6, aa * 0.18);
  }

  var rgb = vec3f(
    clamp(sampCR(0u, in.uv), 0.0, 1.0),
    clamp(sampCR(1u, in.uv), 0.0, 1.0),
    clamp(sampCR(2u, in.uv), 0.0, 1.0));

  let e = 1.2 / f32(P.w);
  let dax = sampCR(3u, in.uv + vec2f(e, 0.0)) - sampCR(3u, in.uv - vec2f(e, 0.0));
  let day = sampCR(3u, in.uv + vec2f(0.0, e)) - sampCR(3u, in.uv - vec2f(0.0, e));
  let n = normalize(vec3f(-dax * 2.2, day * 2.2, 0.9));
  let t = P.time;
  let Ldir = normalize(vec3f(cos(t * 0.3) * 0.6, sin(t * 0.27) * 0.6, 0.75));
  let dif = max(dot(n, Ldir), 0.0);
  let spec = pow(max(dot(reflect(-Ldir, n), vec3f(0.0, 0.0, 1.0)), 0.0), 26.0);
  let r = length(in.uv - 0.5) * 2.0;
  let specCol = mix(vec3f(0.85, 1.0, 0.95), lad(t * 0.05 + r * 0.35), 0.35);
  rgb = rgb * (0.74 + 0.50 * dif) + specCol * spec * smoothstep(0.12, 0.85, a) * 0.55;

  var h1 = 0.0; var h2 = 0.0;
  for (var k = 0u; k < 8u; k++) {
    let ang = f32(k) * 0.785398;
    let d = vec2f(cos(ang), sin(ang));

    h1 += sampBL(3u, in.uv + d * 0.045 * P.peelK);
    h2 += sampBL(3u, in.uv + d * 0.105 * P.peelK);
  }
  h1 = h1 / 8.0; h2 = h2 / 8.0;
  let halo = max(h1 * 0.55 + h2 * 0.40 - a * 0.75, 0.0) * P.glow;
  let glowCol = mix(rgb + vec3f(0.10), lad(t * 0.06), 0.45);
  rgb += glowCol * halo * 0.85;
  var aOut = clamp(a + halo * 0.8, 0.0, 1.0);

  let g = (hash21(in.pos.xy + fract(t) * vec2f(917.0, 311.0)) - 0.5) * 0.028;
  rgb = max(rgb + g * aOut, vec3f(0.0));

  let lum = max(rgb.r, max(rgb.g, rgb.b));
  rgb = mix(lad(t * 0.06) * aOut * 0.8, rgb, smoothstep(0.03, 0.16, lum));
  let over = max(0.0, max(rgb.r, max(rgb.g, rgb.b)) - 1.0);
  rgb = rgb / (1.0 + over);
  ${
    overlay
      ? `return vec4f(rgb * P.fade, aOut * P.fade);`
      : `let ink = vec3f(0.047, 0.051, 0.094);
  return vec4f(ink * (1.0 - aOut) + rgb, 1.0);`
  }
}
`;

export interface NCAMeta {
  channels: number;
  hidden: number;
  grid: number;
  fire_rate: number;
  alpha_threshold: number;
  params: number;
}

export class NCAEngine {
  private device: GPUDevice;
  private ctx: GPUCanvasContext | null;
  private state: [GPUBuffer, GPUBuffer, GPUBuffer];
  private preLife: GPUBuffer;
  private weights: GPUBuffer;
  private params: GPUBuffer;
  private updatePipe: GPUComputePipeline;
  private lifePipe: GPUComputePipeline;
  private seedPipe: GPUComputePipeline;
  private renderPipe: GPURenderPipeline | null = null;
  private cur = 0;
  step = 0;
  private brush = { x: -1, y: -1, r: 0 };
  private fade = 1;
  private peel = 0;
  private quadScale = 1;
  private quadSY = 1;
  private quadOX = 0;
  private quadOY = 0;
  private peelK = 1;
  private glow = 1;
  private viewport: [number, number, number, number] | null = null;
  private readonly overlay: boolean;
  private readonly t0 = performance.now();
  readonly w: number;
  readonly h: number;

  constructor(
    device: GPUDevice,
    canvas: HTMLCanvasElement | null,
    readonly meta: NCAMeta,
    weightsBlob: Float32Array,
    readonly seed: number,
    opts: { overlay?: boolean } = {},
  ) {
    this.device = device;
    this.overlay = !!opts.overlay;
    this.w = meta.grid;
    this.h = meta.grid;
    this.ctx = canvas
      ? configureCanvas(device, canvas, this.overlay ? 'premultiplied' : 'opaque')
      : null;
    const n = this.w * this.h * meta.channels * 4;
    const usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    this.state = [
      createBuffer(device, n, usage),
      createBuffer(device, n, usage),
      createBuffer(device, n, usage),
    ];
    this.preLife = createBuffer(device, this.w * this.h * 4, GPUBufferUsage.STORAGE);
    this.weights = createBuffer(
      device,
      weightsBlob.byteLength,
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      weightsBlob,
    );
    this.params = createBuffer(device, 80, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);

    const mk = (code: string) =>
      device.createComputePipeline({
        layout: 'auto',
        compute: { module: device.createShaderModule({ code }), entryPoint: 'main' },
      });
    this.updatePipe = mk(UPDATE_WGSL);
    this.lifePipe = mk(LIFE_WGSL);
    this.seedPipe = mk(SEED_WGSL);
    if (this.ctx) {
      const renderMod = device.createShaderModule({ code: RENDER_WGSL(this.overlay) });
      this.renderPipe = device.createRenderPipeline({
        layout: 'auto',
        vertex: { module: renderMod, entryPoint: 'vs' },
        fragment: {
          module: renderMod,
          entryPoint: 'fs',
          targets: [
            {
              format: navigator.gpu.getPreferredCanvasFormat(),

              blend: {
                color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
                alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' },
              },
            },
          ],
        },
        primitive: { topology: 'triangle-list' },
      });
    }
    this.reset();
  }

  private writeParams(): void {
    const u = new ArrayBuffer(80);
    const dv = new DataView(u);
    dv.setUint32(0, this.w, true);
    dv.setUint32(4, this.h, true);
    dv.setUint32(8, this.seed >>> 0, true);
    dv.setUint32(12, this.step >>> 0, true);
    dv.setFloat32(16, this.meta.fire_rate, true);
    dv.setFloat32(20, this.meta.alpha_threshold, true);
    dv.setFloat32(24, this.brush.r, true);
    dv.setFloat32(28, this.fade, true);
    dv.setFloat32(32, this.brush.x, true);
    dv.setFloat32(36, this.brush.y, true);
    dv.setFloat32(40, this.peel, true);
    dv.setFloat32(44, this.quadScale, true);
    dv.setFloat32(48, (performance.now() - this.t0) / 1000, true);
    dv.setFloat32(52, this.glow, true);
    dv.setFloat32(56, this.quadSY, true);
    dv.setFloat32(60, this.quadOX, true);
    dv.setFloat32(64, this.quadOY, true);
    dv.setFloat32(68, this.peelK, true);
    this.device.queue.writeBuffer(this.params, 0, u);
  }

  setPeel(v: number): void {
    this.peel = Math.min(1, Math.max(0, v));
  }

  setQuadScale(sx: number, sy = sx, ox = 0, oy = 0): void {
    this.quadScale = sx;
    this.quadSY = sy;
    this.quadOX = ox;
    this.quadOY = oy;
  }

  setPeelScale(k: number): void {
    this.peelK = k;
  }
  setGlow(v: number): void {
    this.glow = v;
  }

  setViewport(x: number, y: number, w: number, h: number): void {
    this.viewport = [x, y, w, h];
  }
  setFade(v: number): void {
    this.fade = v;
  }

  ffTo(target: number): void {
    if (target === this.step) {
      this.tick(0);
      return;
    }
    if (target < this.step) this.reset();

    this.tick(Math.min(target - this.step, 16));
  }

  reset(): void {
    this.step = 0;
    this.writeParams();
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.seedPipe);
    pass.setBindGroup(
      0,
      this.device.createBindGroup({
        layout: this.seedPipe.getBindGroupLayout(0),
        entries: [
          { binding: 1, resource: { buffer: this.state[this.cur]! } },
          { binding: 4, resource: { buffer: this.params } },
        ],
      }),
    );
    pass.dispatchWorkgroups(Math.ceil(this.w / 8), Math.ceil(this.h / 8));
    pass.end();
    this.device.queue.submit([enc.finish()]);
  }

  setBrush(x: number, y: number, r: number): void {
    this.brush = { x, y, r };
  }
  clearBrush(): void {
    this.brush.r = 0;
  }

  tick(steps: number): void {
    const wg = [Math.ceil(this.w / 8), Math.ceil(this.h / 8)] as const;

    if (steps === 0) this.writeParams();
    for (let s = 0; s < steps; s++) {
      this.writeParams();
      const src = this.state[this.cur]!;
      const mid = this.state[(this.cur + 1) % 3]!;
      const dst = this.state[(this.cur + 2) % 3]!;
      const enc = this.device.createCommandEncoder();
      const p1 = enc.beginComputePass();
      p1.setPipeline(this.updatePipe);
      p1.setBindGroup(
        0,
        this.device.createBindGroup({
          layout: this.updatePipe.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: src } },
            { binding: 1, resource: { buffer: mid } },
            { binding: 2, resource: { buffer: this.preLife } },
            { binding: 3, resource: { buffer: this.weights } },
            { binding: 4, resource: { buffer: this.params } },
          ],
        }),
      );
      p1.dispatchWorkgroups(...wg);
      p1.end();
      const p2 = enc.beginComputePass();
      p2.setPipeline(this.lifePipe);
      p2.setBindGroup(
        0,
        this.device.createBindGroup({
          layout: this.lifePipe.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: mid } },
            { binding: 1, resource: { buffer: dst } },
            { binding: 2, resource: { buffer: this.preLife } },
            { binding: 4, resource: { buffer: this.params } },
          ],
        }),
      );
      p2.dispatchWorkgroups(...wg);
      p2.end();
      this.device.queue.submit([enc.finish()]);
      this.cur = (this.cur + 2) % 3;
      this.step++;
    }
    if (this.ctx && this.renderPipe) {
      const enc = this.device.createCommandEncoder();
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
      if (this.viewport) rp.setViewport(...this.viewport, 0, 1);

      rp.setBindGroup(
        0,
        this.device.createBindGroup({
          layout: this.renderPipe.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: this.state[this.cur]! } },
            { binding: 4, resource: { buffer: this.params } },
          ],
        }),
      );

      rp.draw(6, 16);
      rp.end();
      this.device.queue.submit([enc.finish()]);
    }
  }

  swapWeights(blob: Float32Array): void {
    if (blob.byteLength !== this.weights.size) {
      throw new Error(`NCA: weights blob ${blob.byteLength} B ≠ buffer ${this.weights.size} B`);
    }
    this.device.queue.writeBuffer(this.weights, 0, blob);
    this.reset();
  }

  async readState(): Promise<Float32Array> {
    const n = this.w * this.h * this.meta.channels * 4;
    const staging = this.device.createBuffer({
      size: n,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const enc = this.device.createCommandEncoder();
    enc.copyBufferToBuffer(this.state[this.cur]!, 0, staging, 0, n);
    this.device.queue.submit([enc.finish()]);
    await staging.mapAsync(GPUMapMode.READ);
    const out = new Float32Array(staging.getMappedRange().slice(0));
    staging.destroy();
    return out;
  }

  dispose(): void {
    this.state.forEach((b) => b.destroy());
    this.preLife.destroy();
    this.weights.destroy();
    this.params.destroy();
  }
}

export async function fetchNCAWeights(
  name: string,
): Promise<{ meta: NCAMeta; blob: Float32Array }> {
  const [meta, buf] = await Promise.all([
    fetch(`/weights/${name}.json`).then((r) => r.json() as Promise<NCAMeta>),
    fetch(`/weights/${name}.bin`).then((r) => r.arrayBuffer()),
  ]);
  return { meta, blob: new Float32Array(buf) };
}

export async function loadNCA(
  device: GPUDevice,
  canvas: HTMLCanvasElement | null,
  name: string,
  seed = 1,
  opts: { overlay?: boolean; grid?: number } = {},
): Promise<NCAEngine> {
  const { meta, blob } = await fetchNCAWeights(name);

  if (opts.grid) meta.grid = opts.grid;
  return new NCAEngine(device, canvas, meta, blob, seed, opts);
}
