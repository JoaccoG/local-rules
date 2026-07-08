

import type { ZoneMachine } from './zones';
import { RD_REGIMES } from '../engine/regimes';
import type { ChapterVisual } from '../visuals/ChapterVisual';
import type { VisualHost } from '../visuals/fakes';

const MONO = "font-family:'Martian Mono','JetBrains Mono',monospace;";

export interface CutBackend {
  begin(lx: number, ly: number): void;
  move(lx: number, ly: number): void;
  end(): void;
}

let cutBackend: CutBackend | null = null;

export function setCutBackend(b: CutBackend | null): void {
  cutBackend = b;
}

export function mountCutSurface(zm: ZoneMachine, host: VisualHost): void {
  const sticky = document.querySelector<HTMLElement>('[data-climax-sticky]');
  if (!sticky) return;

  const surface = document.createElement('div');
  surface.setAttribute('data-cut-surface', '');
  surface.style.cssText = 'position:absolute;inset:0;touch-action:none;';
  sticky.appendChild(surface);

  const hint = document.createElement('div');
  hint.setAttribute('data-cut-hint', '');
  hint.style.cssText = `position:absolute;left:50%;bottom:56px;transform:translateX(-50%);${MONO}font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#545475;opacity:0;transition:opacity 0.5s ease;pointer-events:none;`;
  hint.textContent = 'drag to cut — it grows back';
  sticky.appendChild(hint);

  let cutting = false;
  let ax = 0;
  let ay = 0;
  let pathLen = 0;
  let lastX = 0;
  let lastY = 0;
  surface.addEventListener('pointerdown', (e) => {
    cutting = true;
    const l = host.subjectLocalFromClient(e.clientX, e.clientY);
    if (cutBackend) {
      cutBackend.begin(l.x, l.y);
      surface.setPointerCapture(e.pointerId);
      return;
    }
    ax = l.x;
    ay = l.y;
    lastX = l.x;
    lastY = l.y;
    pathLen = 0;
    host.setBiteSegment(ax, ay, ax, ay);

    zm.cut(0.35);
    surface.setPointerCapture(e.pointerId);
  });
  surface.addEventListener('pointermove', (e) => {
    if (!cutting) return;
    const l = host.subjectLocalFromClient(e.clientX, e.clientY);
    if (cutBackend) {
      cutBackend.move(l.x, l.y);
      return;
    }
    pathLen += Math.hypot(l.x - lastX, l.y - lastY);
    lastX = l.x;
    lastY = l.y;
    host.setBiteSegment(ax, ay, l.x, l.y);

    zm.cut(Math.min(0.6, 0.35 + pathLen * 0.12));
  });
  const end = () => {
    if (!cutting) return;
    cutting = false;
    if (cutBackend) {
      cutBackend.end();
      return;
    }
    zm.release();
  };
  surface.addEventListener('pointerup', end);
  surface.addEventListener('pointercancel', end);

  (surface as HTMLElement & { lrSetActive?: (on: boolean) => void }).lrSetActive = (on) => {
    hint.style.opacity = on ? '1' : '0';
    surface.style.pointerEvents = on ? 'auto' : 'none';
  };
  surface.style.pointerEvents = 'none';
}

export function setCutSurfaceActive(on: boolean): void {
  const surface = document.querySelector<HTMLElement & { lrSetActive?: (on: boolean) => void }>(
    '[data-cut-surface]',
  );
  surface?.lrSetActive?.(on);
}

export function mountFkMap(

  rdVisual: () => ChapterVisual | undefined,
  onChange: (F: number, k: number, regime: number) => void,
  initial?: { F?: number | undefined; k?: number | undefined },
): { set: (regime: number) => void } | undefined {
  const rd = document.querySelector<HTMLElement>('[data-zone="ch"][data-visual="rd"]');
  if (!rd) return undefined;
  const plots = rd.querySelectorAll<HTMLElement>('div');

  const plot = Array.from(plots).find((d) => d.style.height === '180px');
  if (!plot) return undefined;
  plot.setAttribute('data-control', '');
  plot.style.touchAction = 'none';
  const hairH = plot.children[0] as HTMLElement | undefined;
  const hairV = plot.children[1] as HTMLElement | undefined;
  const dot = plot.children[2] as HTMLElement | undefined;
  const readouts = plot.parentElement?.lastElementChild?.querySelectorAll('span');

  const chip = Array.from(rd.querySelectorAll<HTMLElement>('div')).find((d) =>
    d.textContent?.trim().startsWith('F='),
  );

  const toNorm = (F: number, k: number) => ({ px: (k - 0.03) / 0.04, py: 1 - F / 0.09 });
  const nearest = (px: number, py: number): number => {
    let best = 0;
    let bestD = Infinity;
    RD_REGIMES.forEach((rg, i) => {
      const n = toNorm(rg.F, rg.k);
      const d = (n.px - px) ** 2 + (n.py - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  };

  for (const rg of RD_REGIMES) {
    const n = toNorm(rg.F, rg.k);
    const t = document.createElement('div');
    t.style.cssText = `position:absolute;left:${(n.px * 100).toFixed(1)}%;top:${(n.py * 100).toFixed(1)}%;width:5px;height:5px;border-radius:50%;background:rgba(255,226,77,0.35);transform:translate(-50%,-50%);pointer-events:none;`;
    plot.insertBefore(t, plot.firstChild);
  }

  const apply = (idx: number) => {
    const rg = RD_REGIMES[Math.max(0, Math.min(RD_REGIMES.length - 1, Math.round(idx)))]!;
    const { px, py } = toNorm(rg.F, rg.k);
    if (hairH) hairH.style.top = `${py * 100}%`;
    if (hairV) hairV.style.left = `${px * 100}%`;
    if (dot) {
      dot.style.left = `${px * 100}%`;
      dot.style.top = `${py * 100}%`;
    }
    if (readouts && readouts[0]) readouts[0].textContent = `F ${rg.F.toFixed(4)}`;
    if (readouts && readouts[1]) readouts[1].textContent = `k ${rg.k.toFixed(4)}`;
    if (chip) chip.textContent = `F=${rg.F.toFixed(4)} · k=${rg.k.toFixed(4)}`;
    const vis = rdVisual();
    vis?.setParam('F', rg.F);
    vis?.setParam('k', rg.k);
    onChange(rg.F, rg.k, RD_REGIMES.indexOf(rg));
  };

  const k0 = initial?.k ?? 0.0649;
  const F0 = initial?.F ?? 0.0367;
  const n0 = toNorm(F0, k0);
  apply(nearest(n0.px, n0.py));

  let down = false;
  const fromEvent = (e: PointerEvent) => {
    const r = plot.getBoundingClientRect();
    apply(nearest((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height));
  };
  plot.addEventListener('pointerdown', (e) => {
    down = true;
    plot.setPointerCapture(e.pointerId);
    fromEvent(e);
  });
  plot.addEventListener('pointermove', (e) => {
    if (down) fromEvent(e);
  });
  plot.addEventListener('pointerup', () => (down = false));
  plot.addEventListener('pointercancel', () => (down = false));
  return { set: apply };
}
