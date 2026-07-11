

import type { ChapterVisual, VisualOpts } from './ChapterVisual';
import { SceneGL, type SceneOpts, type GLTargets } from './gl/SceneGL';

export class VisualHost {
  private scene: SceneGL | null = null;

  init(canvas: HTMLCanvasElement, opts: SceneOpts): boolean {
    try {
      this.scene = new SceneGL(canvas, opts);
      return true;
    } catch (e) {
      console.warn('[LR] GL init failed', e);
      this.scene = null;
      return false;
    }
  }

  get alive(): boolean {
    return this.scene !== null;
  }

  setTargets(t: GLTargets): void {
    this.scene?.setTargets(t);
  }
  setMask(cx: number, cy: number, rx: number, ry: number): void {
    this.scene?.setMask(cx, cy, rx, ry);
  }
  setBiteSegment(ax: number, ay: number, bx: number, by: number): void {
    this.scene?.setBiteSegment(ax, ay, bx, by);
  }
  subjectLocalFromClient(x: number, y: number): { x: number; y: number } {
    return this.scene?.subjectLocalFromClient(x, y) ?? { x: 0, y: 0 };
  }
  subjectRect(): { cx: number; cy: number; size: number } {
    return this.scene?.subjectRect() ?? { cx: 0, cy: 0, size: 0 };
  }
  pulse(v?: number): void {
    this.scene?.pulse(v);
  }
  setGrain(v: number): void {
    this.scene?.setGrain(v);
  }
  resize(): void {
    this.scene?.resize();
  }
  freeze(): void {
    this.scene?.freeze();
  }
  dispose(): void {
    this.scene?.dispose();
    this.scene = null;
  }
  get dpr(): number {
    return this.scene?.dpr ?? 1;
  }
}

const SUBJECT_KEYS = ['grow', 'peel', 'bite', 'heal', 'subj', 'chMix'] as const;
type SubjectKey = (typeof SUBJECT_KEYS)[number];

class FakeSceneModeVisual implements ChapterVisual {
  constructor(
    readonly mode: number,
    private host: VisualHost,
  ) {}

  init(_canvas: HTMLCanvasElement, _opts: VisualOpts): void {

  }

  step(_dt: number): void {

  }

  render(): void {

  }

  setParam(key: string, value: number): void {
    if ((SUBJECT_KEYS as readonly string[]).includes(key)) {
      this.host.setTargets({ [key as SubjectKey]: value });
    }
  }

  dispose(): void {

  }
}

export type FakeName =
  | 'conway'
  | 'rulespace'
  | 'ltl'
  | 'smoothlife'
  | 'lenia'
  | 'rd'
  | 'nca';

const MODES: Record<FakeName, number> = {
  conway: 1,
  rulespace: 2,
  ltl: 3,
  smoothlife: 4,
  lenia: 5,
  rd: 6,
  nca: 7,
};

export function createFakeVisual(name: FakeName, host: VisualHost): FakeSceneModeVisual {
  return new FakeSceneModeVisual(MODES[name], host);
}

export function fakeMode(name: FakeName): number {
  return MODES[name];
}
