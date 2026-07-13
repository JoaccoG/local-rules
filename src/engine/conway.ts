import { configureCanvas, createBuffer, densityU32, PCG_WGSL } from "./gpu";
import { LIFE, type Rule } from "./rules";

const STEP_WGSL =  `
${PCG_WGSL}
struct Params { w: u32, h: u32, seed: u32, mode: u32,
  brushX: f32, brushY: f32, brushR: f32, brushV: f32,
  density: u32, fade: f32, birth: u32, survive: u32 }
@group(0) @binding(0) var<storage, read> src: array<f32>;
@group(0) @binding(1) var<storage, read_write> dst: array<f32>;
@group(0) @binding(2) var<uniform> P: Params;

fn at(x: i32, y: i32) -> f32 {
  let xi = (x + i32(P.w)) % i32(P.w);
  let yi = (y + i32(P.h)) % i32(P.h);
  return src[u32(yi) * P.w + u32(xi)];
}

@compute @workgroup_size(16, 16)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  if (gid.x >= P.w || gid.y >= P.h) { return; }
  let i = gid.y * P.w + gid.x;
  if (P.mode == 1u) {

    dst[i] = select(0.0, 1.0, randU(i, 0u, P.seed) < P.density);
    return;
  }
  let x = i32(gid.x); let y = i32(gid.y);
  let n = at(x-1,y-1)+at(x,y-1)+at(x+1,y-1)+at(x-1,y)+at(x+1,y)+at(x-1,y+1)+at(x,y+1)+at(x+1,y+1);
  let alive = at(x, y);

  let ni = u32(n + 0.5);
  let mask = select(P.birth, P.survive, alive > 0.5);
  var next = select(0.0, 1.0, ((mask >> ni) & 1u) == 1u);

  if (P.brushR > 0.0) {
    let d = distance(vec2f(f32(gid.x), f32(gid.y)), vec2f(P.brushX, P.brushY));
    if (d < P.brushR) { next = P.brushV; }
  }
  dst[i] = next;
}
`;

const RENDER_WGSL = (overlay: boolean) =>  `
struct Params { w: u32, h: u32, seed: u32, mode: u32,
  brushX: f32, brushY: f32, brushR: f32, brushV: f32,
  density: u32, fade: f32, birth: u32, survive: u32 }
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
@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let fx = in.uv.x * f32(P.w);
  let fy = (1.0 - in.uv.y) * f32(P.h);
  let gx = u32(fx);
  let gy = u32(fy);
  let v = state[min(gy, P.h - 1u) * P.w + min(gx, P.w - 1u)];
  ${
		overlay
			? `

  let cyan = vec3f(0.302, 0.882, 1.0);
  let cold = mix(cyan, vec3f(0.72, 0.78, 0.88), 0.22);
  let fxc = fract(fx); let fyc = fract(fy);
  let grid = (step(0.94, fxc) + step(0.94, fyc)) * 0.045;
  let a = clamp(v * 0.62 + grid, 0.0, 1.0) * P.fade;
  return vec4f(cold * 0.40 * a * 2.2, a);`
			: `let ink = vec3f(0.047, 0.051, 0.094);
  let cyan = vec3f(0.302, 0.882, 1.0);
  return vec4f(mix(ink, cyan, v), 1.0);`
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

export interface ConwayStats {
	alive: number;
	frame: number;
}

export class ConwayEngine {
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
	stats: ConwayStats = { alive: 0, frame: 0 };
	private brush = { x: -1, y: -1, r: 0, v: 1 };
	private density = 0.18;
	private fade = 1;
	private rule: Rule = LIFE;
	private viewport: [number, number, number, number] | null = null;
	private readonly overlay: boolean;

	constructor(
		device: GPUDevice,
		canvas: HTMLCanvasElement,
		readonly w: number,
		readonly h: number,
		readonly seed: number,
		opts: { overlay?: boolean; density?: number; rule?: Rule } = {},
	) {
		this.device = device;
		this.overlay = !!opts.overlay;
		this.density = opts.density ?? 0.18;
		this.rule = opts.rule ?? LIFE;
		this.ctx = configureCanvas(
			device,
			canvas,
			this.overlay ? "premultiplied" : "opaque",
		);
		const n = w * h;
		const stateUsage =
			GPUBufferUsage.STORAGE |
			GPUBufferUsage.COPY_SRC |
			GPUBufferUsage.COPY_DST;
		this.bufA = createBuffer(device, n * 4, stateUsage);
		this.bufB = createBuffer(device, n * 4, stateUsage);
		this.params = createBuffer(
			device,
			48,
			GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		);
		const wgCount = 64;
		this.partial = createBuffer(
			device,
			wgCount * 4,
			GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
		);
		this.partialRead = createBuffer(
			device,
			wgCount * 4,
			GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
		);

		const stepMod = device.createShaderModule({ code: STEP_WGSL });
		const renderMod = device.createShaderModule({
			code: RENDER_WGSL(this.overlay),
		});
		const reduceMod = device.createShaderModule({ code: REDUCE_WGSL });
		this.stepPipe = device.createComputePipeline({
			layout: "auto",
			compute: { module: stepMod, entryPoint: "main" },
		});
		this.renderPipe = device.createRenderPipeline({
			layout: "auto",
			vertex: { module: renderMod, entryPoint: "vs" },
			fragment: {
				module: renderMod,
				entryPoint: "fs",
				targets: [{ format: navigator.gpu.getPreferredCanvasFormat() }],
			},
			primitive: { topology: "triangle-list" },
		});
		this.reducePipe = device.createComputePipeline({
			layout: "auto",
			compute: { module: reduceMod, entryPoint: "main" },
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
		const u = new ArrayBuffer(48);
		const dv = new DataView(u);
		dv.setUint32(0, this.w, true);
		dv.setUint32(4, this.h, true);
		dv.setUint32(8, this.seed >>> 0, true);
		dv.setUint32(12, mode, true);
		dv.setFloat32(16, this.brush.x, true);
		dv.setFloat32(20, this.brush.y, true);
		dv.setFloat32(24, this.brush.r, true);
		dv.setFloat32(28, this.brush.v, true);
		dv.setUint32(32, densityU32(this.density), true);
		dv.setFloat32(36, this.fade, true);
		dv.setUint32(40, this.rule.birth, true);
		dv.setUint32(44, this.rule.survive, true);
		this.device.queue.writeBuffer(this.params, 0, u);
	}

	setViewport(x: number, y: number, w: number, h: number): void {
		this.viewport = [x, y, w, h];
	}
	setFade(v: number): void {
		this.fade = v;
	}

	setRule(rule: Rule): void {
		this.rule = rule;
	}
	getRule(): Rule {
		return this.rule;
	}

	reseed(density: number): void {
		this.density = Math.min(1, Math.max(0, density));
		this.writeParams(1);
		const enc = this.device.createCommandEncoder();
		const pass = enc.beginComputePass();
		pass.setPipeline(this.stepPipe);
		pass.setBindGroup(0, this.groups[this.flip ^ 1]!);
		pass.dispatchWorkgroups(Math.ceil(this.w / 16), Math.ceil(this.h / 16));
		pass.end();
		this.device.queue.submit([enc.finish()]);

	}

	setBrush(x: number, y: number, r: number, v: number): void {
		this.brush = { x, y, r, v };
	}
	clearBrush(): void {
		this.brush.r = 0;
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

		if (this.frame % 30 === 0 && !this.statPending) {
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
					loadOp: "clear",
					storeOp: "store",
					clearValue: this.overlay
						? { r: 0, g: 0, b: 0, a: 0 }
						: { r: 0, g: 0, b: 0, a: 1 },
				},
			],
		});
		rp.setPipeline(this.renderPipe);
		rp.setBindGroup(0, this.renderGroups[this.flip]!);
		if (this.viewport) rp.setViewport(...this.viewport, 0, 1);
		rp.draw(6);
		rp.end();
		this.device.queue.submit([enc.finish()]);

		if (this.frame % 30 === 0 && !this.statPending) {
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
		enc.copyBufferToBuffer(
			this.flip === 0 ? this.bufA : this.bufB,
			0,
			staging,
			0,
			n,
		);
		this.device.queue.submit([enc.finish()]);
		await staging.mapAsync(GPUMapMode.READ);
		const out = new Float32Array(staging.getMappedRange().slice(0));
		staging.destroy();
		return out;
	}

	writeState(data: Float32Array): void {
		this.device.queue.writeBuffer(
			this.flip === 0 ? this.bufA : this.bufB,
			0,
			data,
		);
	}

	dispose(): void {
		this.bufA.destroy();
		this.bufB.destroy();
		this.params.destroy();
		this.partial.destroy();
		this.partialRead.destroy();
	}
}
