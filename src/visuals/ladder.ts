
import { hex2v, lerp3, type Vec3 } from '../lib/math';

export const LADDER = ['#4DE1FF', '#8B5CF6', '#FF3D8B', '#FF7A2F', '#2BFFB0', '#FFE24D'] as const;

export function ladderColor(h: number): Vec3 {
  h = ((h % 1) + 1) % 1;
  const segp = h * 6;
  const i = Math.floor(segp) % 6;
  const j = (i + 1) % 6;
  const f = segp - Math.floor(segp);
  return lerp3(hex2v(LADDER[i]!), hex2v(LADDER[j]!), f);
}
