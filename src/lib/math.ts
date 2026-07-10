
export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));

export const seg = (p: number, a: number, b: number): number => clamp((p - a) / (b - a), 0, 1);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export type Vec3 = [number, number, number];

export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
  lerp(a[2], b[2], t),
];

export function hex2v(h: string): Vec3 {
  const n = parseInt(h.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
