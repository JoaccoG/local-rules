

export interface VisualOpts {

  seed: number;

  frozen: boolean;

  dpr: number;
}

export interface ChapterVisual {
  init(canvas: HTMLCanvasElement, opts: VisualOpts): void;
  step(dt: number): void;
  render(): void;
  setParam(key: string, value: number): void;
  dispose(): void;
}
