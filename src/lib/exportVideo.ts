

export class CanvasRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private startedAt = 0;
  private tick: ReturnType<typeof setInterval> | undefined;
  private raf = 0;
  private taps: HTMLVideoElement[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    private onTime: (seconds: number) => void,
  ) {}

  get active(): boolean {
    return this.recorder !== null;
  }

  start(): boolean {
    if (this.recorder) return false;

    const layers = Array.from(
      document.querySelectorAll<HTMLCanvasElement>('canvas[data-gl], canvas[data-gl-engine]'),
    ).filter((c) => c.width > 0 && c.style.display !== 'none');
    const first = layers[0] ?? this.canvas;
    const comp = document.createElement('canvas');
    comp.width = first.width;
    comp.height = first.height;
    const ctx = comp.getContext('2d');
    if (!ctx) return false;
    const stream = comp.captureStream(60);
    const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((m) =>
      MediaRecorder.isTypeSupported(m),
    );
    if (!mime) return false;
    this.taps = layers.map((c) => {
      const v = document.createElement('video');
      v.muted = true;
      v.playsInline = true;
      v.srcObject = c.captureStream(60);
      void v.play().catch(() => {});
      return v;
    });
    const taps = this.taps;
    const draw = () => {

      ctx.fillStyle = '#0C0D18';
      ctx.fillRect(0, 0, comp.width, comp.height);
      for (const v of taps) {
        if (v.readyState >= 2) ctx.drawImage(v, 0, 0, comp.width, comp.height);
      }
      this.raf = requestAnimationFrame(draw);
    };
    draw();
    const chunks: Blob[] = [];
    this.chunks = chunks;
    this.recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 12_000_000 });

    this.recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    this.recorder.start(250);
    this.startedAt = performance.now();
    this.tick = setInterval(() => this.onTime((performance.now() - this.startedAt) / 1000), 500);
    return true;
  }

  stop(): void {
    const rec = this.recorder;
    if (!rec) return;
    this.recorder = null;
    clearInterval(this.tick);
    cancelAnimationFrame(this.raf);
    for (const v of this.taps) {
      (v.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
      v.srcObject = null;
    }
    this.taps = [];

    const chunks = this.chunks;
    rec.onstop = () => {
      rec.stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: rec.mimeType });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `local-rules-${Date.now()}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    };
    rec.stop();
  }
}
