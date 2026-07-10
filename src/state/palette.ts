

import type { Vec3 } from '../lib/math';

const srgb2lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lin2srgb = (c: number) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

export function rgb2oklab([r, g, b]: Vec3): Vec3 {
  const lr = srgb2lin(r);
  const lg = srgb2lin(g);
  const lb = srgb2lin(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklab2rgb([L, a, bb]: Vec3): Vec3 {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3;
  const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const cl = (v: number) => Math.min(1, Math.max(0, lin2srgb(v)));
  return [cl(lr), cl(lg), cl(lb)];
}

export function oklabMix(a: Vec3, b: Vec3, t: number): Vec3 {
  const A = rgb2oklab(a);
  const B = rgb2oklab(b);
  return oklab2rgb([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

export interface Palette {
  id: string;
  name: string;

  a: Vec3;
  b: Vec3;
}

export const PALETTES: Palette[] = [
  { id: 'spectral', name: 'Spectral', a: [0.302, 0.882, 1.0], b: [0.545, 0.361, 0.965] },
  { id: 'bio', name: 'Bio mint', a: [0.169, 1.0, 0.69], b: [0.302, 0.882, 1.0] },
  { id: 'ember', name: 'Ember', a: [1.0, 0.478, 0.184], b: [1.0, 0.239, 0.545] },
  { id: 'sulfur', name: 'Sulfur', a: [1.0, 0.886, 0.302], b: [0.169, 1.0, 0.69] },
];

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]!;
}

export function mixPalettes(from: Palette, to: Palette, t: number): { a: Vec3; b: Vec3 } {
  return { a: oklabMix(from.a, to.a, t), b: oklabMix(from.b, to.b, t) };
}
