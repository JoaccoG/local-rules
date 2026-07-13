

export interface GPU {
  device: GPUDevice;
  adapterInfo: string;
}

export async function initGPU(onLost: (reason: string) => void): Promise<GPU | null> {
  if (!('gpu' in navigator)) return null;
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return null;
  const device = await adapter.requestDevice();
  device.lost.then((info) => onLost(info.reason ?? 'unknown'));

  device.onuncapturederror = (e) => console.error('[webgpu]', e.error.message);
  const info = adapter.info;
  return {
    device,
    adapterInfo: [info?.vendor, info?.architecture].filter(Boolean).join(' ') || 'unknown adapter',
  };
}

export function configureCanvas(
  device: GPUDevice,
  canvas: HTMLCanvasElement,
  alphaMode: GPUCanvasAlphaMode = 'opaque',
): GPUCanvasContext {
  const ctx = canvas.getContext('webgpu');
  if (!ctx) throw new Error('no webgpu canvas context');
  ctx.configure({ device, format: navigator.gpu.getPreferredCanvasFormat(), alphaMode });
  return ctx;
}

export function createBuffer(
  device: GPUDevice,
  size: number,
  usage: GPUBufferUsageFlags,
  data?: ArrayBufferView,
): GPUBuffer {
  const buf = device.createBuffer({ size, usage, mappedAtCreation: !!data });
  if (data) {
    new Uint8Array(buf.getMappedRange()).set(
      new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    );
    buf.unmap();
  }
  return buf;
}

export const PCG_WGSL =  `
fn pcg(v: u32) -> u32 {
  let state = v * 747796405u + 2891336453u;
  let word  = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}
fn randU(cell: u32, step: u32, seed: u32) -> u32 {
  return pcg(pcg(pcg(seed) ^ cell) ^ step);
}
fn rand01(cell: u32, step: u32, seed: u32) -> f32 {
  return f32(randU(cell, step, seed)) / 4294967296.0;
}
`;

export function densityU32(density: number): number {
  return Math.min(0xffffffff, Math.round(density * 2 ** 32));
}
