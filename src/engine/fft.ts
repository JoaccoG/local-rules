

const STAGE_WGSL =  `

struct Params { n: u32, bigl: u32, dir: u32, sign: f32 }
@group(0) @binding(0) var<storage, read> src: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> dst: array<vec2f>;
@group(0) @binding(2) var<uniform> P: Params;

fn cmul(a: vec2f, b: vec2f) -> vec2f {
  return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let n = P.n;
  if (gid.x >= n * n) { return; }
  let line = gid.x / n;
  let idx = gid.x % n;
  let L = P.bigl;
  let e = (idx / L) * (L / 2u) + (idx % (L / 2u));
  let o = e + n / 2u;
  let ang = -P.sign * 6.28318530717959 * f32(idx % L) / f32(L);
  let w = vec2f(cos(ang), sin(ang));
  var i0: u32; var i1: u32; var oi: u32;
  if (P.dir == 0u) {
    i0 = line * n + e; i1 = line * n + o; oi = line * n + idx;
  } else {
    i0 = e * n + line; i1 = o * n + line; oi = idx * n + line;
  }
  dst[oi] = src[i0] + cmul(w, src[i1]);
}
`;

const PACK_WGSL =  `
@group(0) @binding(0) var<storage, read> src: array<f32>;
@group(0) @binding(1) var<storage, read_write> dst: array<vec2f>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= arrayLength(&src)) { return; }
  dst[gid.x] = vec2f(src[gid.x], 0.0);
}
`;

const MUL_WGSL =  `
struct Params { scale: f32 }
@group(0) @binding(0) var<storage, read> a: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> dst: array<vec2f>;
@group(0) @binding(2) var<uniform> P: Params;
@group(0) @binding(3) var<storage, read> k: array<vec2f>;
fn cmul(x: vec2f, y: vec2f) -> vec2f {
  return vec2f(x.x * y.x - x.y * y.y, x.x * y.y + x.y * y.x);
}
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= arrayLength(&a)) { return; }
  dst[gid.x] = cmul(a[gid.x], k[gid.x]) * P.scale;
}
`;

const UNPACK_WGSL =  `
@group(0) @binding(0) var<storage, read> src: array<vec2f>;
@group(0) @binding(1) var<storage, read_write> dst: array<f32>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= arrayLength(&dst)) { return; }
  dst[gid.x] = src[gid.x].x;
}
`;

const DIRECT_WGSL =  `
struct Params { w: u32, h: u32, r: u32, pad: u32 }
@group(0) @binding(0) var<storage, read> src: array<f32>;
@group(0) @binding(1) var<storage, read_write> dst: array<f32>;
@group(0) @binding(2) var<uniform> P: Params;
@group(0) @binding(3) var<storage, read> kern: array<f32>;
@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.w || gid.y >= P.h) { return; }
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
  dst[gid.y * P.w + gid.x] = u;
}
`;

const UNIFORM_STRIDE = 256;

export class FFTConv {
  private device: GPUDevice;
  readonly n: number;
  private readonly log2n: number;
  private cbufA: GPUBuffer;
  private cbufB: GPUBuffer;
  private kspec: GPUBuffer;
  private passParams: GPUBuffer;
  private mulParams: GPUBuffer;
  private stagePipe: GPUComputePipeline;
  private packPipe: GPUComputePipeline;
  private mulPipe: GPUComputePipeline;
  private unpackPipe: GPUComputePipeline;
  private stageAB: GPUBindGroup;
  private stageBA: GPUBindGroup;
  private mulAB: GPUBindGroup;

  constructor(device: GPUDevice, n: number) {
    if ((n & (n - 1)) !== 0 || n < 4) throw new Error(`FFTConv: n must be a power of two, got ${n}`);
    this.device = device;
    this.n = n;
    this.log2n = Math.log2(n);
    const cbytes = n * n * 2 * 4;
    this.cbufA = device.createBuffer({ size: cbytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    this.cbufB = device.createBuffer({ size: cbytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
    this.kspec = device.createBuffer({ size: cbytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });

    const slots = 4 * this.log2n;
    this.passParams = device.createBuffer({
      size: slots * UNIFORM_STRIDE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const u = new ArrayBuffer(slots * UNIFORM_STRIDE);
    const dv = new DataView(u);
    let slot = 0;
    for (const [dir, sign] of [[0, 1], [1, 1], [1, -1], [0, -1]] as const) {
      for (let s = 0; s < this.log2n; s++) {
        const off = slot * UNIFORM_STRIDE;
        dv.setUint32(off, n, true);
        dv.setUint32(off + 4, 1 << (s + 1), true);
        dv.setUint32(off + 8, dir, true);
        dv.setFloat32(off + 12, sign, true);
        slot++;
      }
    }
    device.queue.writeBuffer(this.passParams, 0, u);

    this.mulParams = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    device.queue.writeBuffer(this.mulParams, 0, new Float32Array([1 / (n * n), 0, 0, 0]));

    const mk = (code: string) =>
      device.createComputePipeline({
        layout: 'auto',
        compute: { module: device.createShaderModule({ code }), entryPoint: 'main' },
      });

    const stageBGL = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true } },
      ],
    });
    this.stagePipe = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [stageBGL] }),
      compute: { module: device.createShaderModule({ code: STAGE_WGSL }), entryPoint: 'main' },
    });
    this.packPipe = mk(PACK_WGSL);
    this.mulPipe = mk(MUL_WGSL);
    this.unpackPipe = mk(UNPACK_WGSL);

    const stageBG = (src: GPUBuffer, dst: GPUBuffer) =>
      device.createBindGroup({
        layout: stageBGL,
        entries: [
          { binding: 0, resource: { buffer: src } },
          { binding: 1, resource: { buffer: dst } },
          { binding: 2, resource: { buffer: this.passParams, size: 16 } },
        ],
      });
    this.stageAB = stageBG(this.cbufA, this.cbufB);
    this.stageBA = stageBG(this.cbufB, this.cbufA);
    this.mulAB = device.createBindGroup({
      layout: this.mulPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.cbufA } },
        { binding: 1, resource: { buffer: this.cbufB } },
        { binding: 2, resource: { buffer: this.mulParams } },
        { binding: 3, resource: { buffer: this.kspec } },
      ],
    });
  }

  private encodeAxis(pass: GPUComputePassEncoder, slot0: number, startInA: boolean): boolean {
    const groups = Math.ceil((this.n * this.n) / 256);
    let inA = startInA;
    for (let s = 0; s < this.log2n; s++) {
      pass.setBindGroup(0, inA ? this.stageAB : this.stageBA, [(slot0 + s) * UNIFORM_STRIDE]);
      pass.dispatchWorkgroups(groups);
      inA = !inA;
    }
    return inA;
  }

  setKernel(weights: Float32Array, R: number): void {
    const n = this.n;
    const side = 2 * R + 1;
    if (side > n) throw new Error(`FFTConv: kernel side ${side} exceeds grid ${n}`);
    const padded = new Float32Array(n * n);
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        padded[((dy + n) % n) * n + ((dx + n) % n)] = weights[(dy + R) * side + (dx + R)]!;
      }
    }
    const tmp = this.device.createBuffer({
      size: n * n * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(tmp, 0, padded);
    const packBG = this.device.createBindGroup({
      layout: this.packPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: tmp } },
        { binding: 1, resource: { buffer: this.cbufA } },
      ],
    });
    const enc = this.device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(this.packPipe);
    pass.setBindGroup(0, packBG);
    pass.dispatchWorkgroups(Math.ceil((n * n) / 256));
    pass.setPipeline(this.stagePipe);
    let inA = this.encodeAxis(pass, 0, true);
    inA = this.encodeAxis(pass, this.log2n, inA);
    pass.end();

    enc.copyBufferToBuffer(inA ? this.cbufA : this.cbufB, 0, this.kspec, 0, n * n * 2 * 4);
    this.device.queue.submit([enc.finish()]);
    tmp.destroy();
  }

  encode(enc: GPUCommandEncoder, src: GPUBuffer, dst: GPUBuffer): void {
    const n = this.n;
    const packBG = this.device.createBindGroup({
      layout: this.packPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: src } },
        { binding: 1, resource: { buffer: this.cbufA } },
      ],
    });
    const pass = enc.beginComputePass();
    pass.setPipeline(this.packPipe);
    pass.setBindGroup(0, packBG);
    pass.dispatchWorkgroups(Math.ceil((n * n) / 256));
    pass.setPipeline(this.stagePipe);
    let inA = this.encodeAxis(pass, 0, true);
    inA = this.encodeAxis(pass, this.log2n, inA);
    pass.end();

    if (!inA) {
      enc.copyBufferToBuffer(this.cbufB, 0, this.cbufA, 0, n * n * 2 * 4);
    }
    const pass2 = enc.beginComputePass();
    pass2.setPipeline(this.mulPipe);
    pass2.setBindGroup(0, this.mulAB);
    pass2.dispatchWorkgroups(Math.ceil((n * n) / 256));
    pass2.setPipeline(this.stagePipe);
    let inA2 = this.encodeAxis(pass2, 2 * this.log2n, false);
    inA2 = this.encodeAxis(pass2, 3 * this.log2n, inA2);
    const unpackBG = this.device.createBindGroup({
      layout: this.unpackPipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inA2 ? this.cbufA : this.cbufB } },
        { binding: 1, resource: { buffer: dst } },
      ],
    });
    pass2.setPipeline(this.unpackPipe);
    pass2.setBindGroup(0, unpackBG);
    pass2.dispatchWorkgroups(Math.ceil((n * n) / 256));
    pass2.end();
  }

  dispose(): void {
    this.cbufA.destroy();
    this.cbufB.destroy();
    this.kspec.destroy();
    this.passParams.destroy();
    this.mulParams.destroy();
  }
}

export class DirectConv {
  private device: GPUDevice;
  readonly w: number;
  readonly h: number;
  private params: GPUBuffer;
  private kern: GPUBuffer;
  private pipe: GPUComputePipeline;

  constructor(device: GPUDevice, w: number, h: number, maxR = 64) {
    this.device = device;
    this.w = w;
    this.h = h;
    const side = 2 * maxR + 1;
    this.params = device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.kern = device.createBuffer({ size: side * side * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.pipe = device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: DIRECT_WGSL }), entryPoint: 'main' },
    });
  }

  setKernel(weights: Float32Array, R: number): void {
    this.device.queue.writeBuffer(this.kern, 0, weights);
    const u = new Uint32Array([this.w, this.h, R, 0]);
    this.device.queue.writeBuffer(this.params, 0, u);
  }

  encode(enc: GPUCommandEncoder, src: GPUBuffer, dst: GPUBuffer): void {
    const bg = this.device.createBindGroup({
      layout: this.pipe.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: src } },
        { binding: 1, resource: { buffer: dst } },
        { binding: 2, resource: { buffer: this.params } },
        { binding: 3, resource: { buffer: this.kern } },
      ],
    });
    const pass = enc.beginComputePass();
    pass.setPipeline(this.pipe);
    pass.setBindGroup(0, bg);
    pass.dispatchWorkgroups(Math.ceil(this.w / 16), Math.ceil(this.h / 16));
    pass.end();
  }

  dispose(): void {
    this.params.destroy();
    this.kern.destroy();
  }
}
