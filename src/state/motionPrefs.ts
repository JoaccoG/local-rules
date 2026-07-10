

import type { Density } from '../visuals/gl/SceneGL';

export type MotionMode = 'full' | 'calm' | 'static';

export interface Prefs {
  motion: MotionMode;
  density: Density;
  bloom: number;
  grain: number;

  reducedMotion: boolean;

  calm: boolean;
}

export function readPrefs(): Prefs {
  const q = new URLSearchParams(location.search);
  const motion = (q.get('motion') as MotionMode) || 'full';
  const density = (q.get('density') as Density) || 'cinema';
  const bloom = q.has('bloom') ? Number(q.get('bloom')) : 0.8;
  const grain = q.has('grain') ? Number(q.get('grain')) : 0.028;
  const reducedMotion =
    matchMedia('(prefers-reduced-motion: reduce)').matches || motion === 'static';
  return {
    motion,
    density: ['cinema', 'balanced', 'light'].includes(density) ? density : 'cinema',
    bloom: Number.isFinite(bloom) ? bloom : 0.8,
    grain: Number.isFinite(grain) ? grain : 0.028,
    reducedMotion,
    calm: motion === 'calm',
  };
}
