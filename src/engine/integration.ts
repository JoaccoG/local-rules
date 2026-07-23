

import { initGPU, type GPU } from './gpu';
import { ConwayEngine } from './conway';
import { ExplorerEngine, EXPLORER_TILES } from './explorer';
import { explorerRules, formatRule, ruleName } from './rules';
import { LtLEngine } from './ltl';
import { LeniaEngine } from './lenia';
import { ORBIUM_CELLS, ORBIUM_PARAMS } from './orbium';
import { LTL_PRESETS, NCA_CREATURES } from './regimes';
import { SPECIES } from './species';
import { RDEngine } from './rd';
import { fetchNCAWeights, loadNCA, type NCAEngine } from './nca';
import type { ZoneMachine, EngineFrameInfo } from '../motion/zones';
import type { VisualHost } from '../visuals/fakes';
import type { ChapterVisual, VisualOpts } from '../visuals/ChapterVisual';
import type { Prefs } from '../state/motionPrefs';
import { setCutBackend } from '../motion/interactions';

const DPR = () => Math.min(devicePixelRatio || 1, 2);

const NCA_GRID = 160;
const NCA_LOCAL = 64 / NCA_GRID;

function chFade(w: number): number {
  const t = Math.min(1, Math.max(0, (w - 0.25) / 0.5));
  return t * t * (3 - 2 * t);
}

function fitSquare(
  bw: number,
  bh: number,
  cx: number,
  cy: number,
  size: number,
): [number, number, number, number] {
  const s = Math.min(size, bw, bh);
  const x = Math.min(Math.max(cx - s / 2, 0), bw - s);
  const y = Math.min(Math.max(cy - s / 2, 0), bh - s);
  return [x, y, s, s];
}

function overlayCanvas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.setAttribute('data-gl-engine', '');
  c.setAttribute('aria-hidden', 'true');
  c.style.cssText =
    'position:fixed;inset:0;width:100%;height:100%;z-index:0;pointer-events:none;display:block;';
  const base = document.querySelector('canvas[data-gl]');
  (base ?? document.body).insertAdjacentElement(base ? 'afterend' : 'beforeend', c);
  return c;
}

function sizeCanvas(c: HTMLCanvasElement): void {
  c.width = Math.round(innerWidth * DPR());
  c.height = Math.round(innerHeight * DPR());
}

class RealConwayVisual implements ChapterVisual {
  stepsPerSec = 6;
  constructor(readonly engine: ConwayEngine) {}
  init(_c: HTMLCanvasElement, _o: VisualOpts): void {}
  step(_dt: number): void {}
  render(): void {}
  setParam(key: string, value: number): void {
    if (key === 'density') this.engine.reseed(value);
    else if (key === 'speed') this.stepsPerSec = value;
  }
  dispose(): void {
    this.engine.dispose();
  }
}

class RealRuleSpaceVisual implements ChapterVisual {
  stepsPerSec = 6;
  constructor(
    readonly engine: ExplorerEngine,
    readonly seed: number,
  ) {}
  init(_c: HTMLCanvasElement, _o: VisualOpts): void {}
  step(_dt: number): void {}
  render(): void {}
  setParam(key: string, value: number): void {
    if (key === 'worlds') this.engine.setRules(explorerRules(this.seed, value));
    else if (key === 'speed') this.stepsPerSec = value;
  }
  dispose(): void {
    this.engine.dispose();
  }
}

class RealLtLVisual implements ChapterVisual {

  gensPerSec = 9;
  constructor(
    readonly engine: LtLEngine,

    readonly onMeta: (meta: string) => void,
  ) {}
  init(_c: HTMLCanvasElement, _o: VisualOpts): void {}
  step(_dt: number): void {}
  render(): void {}
  setParam(key: string, value: number): void {
    if (key === 'preset') {
      const p = LTL_PRESETS[Math.round(value)];
      if (!p) return;
      this.engine.setRadius(p.r);
      this.engine.reseed(p.bodies);

      const g = this.engine.getRanges();
      const chip = Array.from(
        document.querySelectorAll<HTMLElement>('[data-zone="ch"][data-visual="ltl"] div'),
      ).find((d) => {
        const t = d.textContent?.trim() ?? '';
        return t.startsWith('R=') && t.includes('· B');
      });
      if (chip) chip.textContent = `R=${p.r} · B ${g.bLo}–${g.bHi} · S ${g.sLo}–${g.sHi}`;
      this.onMeta(`R=${p.r} · 1 bit`);
    } else if (key === 'speed') this.gensPerSec = value * 1.5;

  }
  dispose(): void {
    this.engine.dispose();
  }
}

class RealLeniaVisual implements ChapterVisual {
  speciesIdx = 0;

  stepsPerSec = 60;

  paramEpoch = 0;
  constructor(
    readonly engine: LeniaEngine,
    readonly placeSpecies: (idx: number) => void,
  ) {}
  init(_c: HTMLCanvasElement, _o: VisualOpts): void {}
  step(_dt: number): void {}
  render(): void {}
  setParam(key: string, value: number): void {
    if (key === 'species') {
      this.paramEpoch++;
      const sp = SPECIES[Math.round(value)];
      if (!sp) return;
      this.speciesIdx = Math.round(value);
      this.engine.setGrowth(sp.mu, sp.sigma);
      this.engine.setKernel(sp.R, ORBIUM_PARAMS.betas);
      this.placeSpecies(this.speciesIdx);

      const chip = Array.from(
        document.querySelectorAll<HTMLElement>('[data-zone="ch"][data-visual="lenia"] div'),
      ).find((d) => d.textContent?.trim().startsWith('μ='));
      if (chip) chip.textContent = `μ=${sp.mu} · σ=${sp.sigma} · R=${sp.R}`;
    } else if (key === 'speed') this.stepsPerSec = value * 10;

  }
  dispose(): void {
    this.engine.dispose();
  }
}

class RealRDVisual implements ChapterVisual {
  private F = 0.0367;
  private k = 0.0649;

  stepsPerFrame = 10;

  paramEpoch = 0;
  constructor(readonly engine: RDEngine) {}
  init(_c: HTMLCanvasElement, _o: VisualOpts): void {}
  step(_dt: number): void {}
  render(): void {}
  setParam(key: string, value: number): void {
    if (key === 'F') {
      this.paramEpoch++;
      this.engine.setParams((this.F = value), this.k);
    } else if (key === 'k') {
      this.paramEpoch++;
      this.engine.setParams(this.F, (this.k = value));
    } else if (key === 'speed') this.stepsPerFrame = value * 2;
  }
  dispose(): void {
    this.engine.dispose();
  }
}

class RealNCAVisual implements ChapterVisual {
  creatureIdx = 0;

  private swapToken = 0;
  constructor(readonly engine: NCAEngine) {}
  init(_c: HTMLCanvasElement, _o: VisualOpts): void {}
  step(_dt: number): void {}
  render(): void {}
  setParam(key: string, value: number): void {
    if (key !== 'creature') return;
    const c = NCA_CREATURES[Math.round(value)];
    if (!c) return;
    this.creatureIdx = Math.round(value);
    const token = ++this.swapToken;
    void fetchNCAWeights(c.key)
      .then(({ blob }) => {
        if (token === this.swapToken) this.engine.swapWeights(blob);
      })
      .catch((e) => console.warn('[LR] creature swap failed', e));
  }
  dispose(): void {
    this.engine.dispose();
  }
}

export interface EngineAttachment {
  adapterInfo: string;
}

export async function attachEngines(opts: {
  zm: ZoneMachine;
  host: VisualHost;
  visuals: Record<string, ChapterVisual>;
  prefs: Prefs;
  seed: number;
}): Promise<EngineAttachment | null> {
  const { zm, host, visuals, prefs, seed } = opts;
  if (prefs.reducedMotion) return null;
  let gpu: GPU | null = null;
  try {
    gpu = await initGPU(() => {

      zm.realLayers.conway = false;
      zm.realLayers.rulespace = false;
      zm.realLayers.ltl = false;
      zm.realLayers.lenia = false;
      zm.realLayers.rd = false;
      zm.realLayers.nca = false;
      setCutBackend(null);
    });
  } catch {
    gpu = null;
  }
  if (!gpu) return null;

  const conwayCanvas = overlayCanvas();
  const explorerCanvas = overlayCanvas();
  const ltlCanvas = overlayCanvas();
  const leniaCanvas = overlayCanvas();
  const rdCanvas = overlayCanvas();
  const ncaCanvas = overlayCanvas();
  sizeCanvas(conwayCanvas);
  sizeCanvas(explorerCanvas);
  sizeCanvas(ltlCanvas);
  sizeCanvas(leniaCanvas);
  sizeCanvas(rdCanvas);
  sizeCanvas(ncaCanvas);

  const conway = new ConwayEngine(gpu.device, conwayCanvas, 64, 64, seed, {
    overlay: true,
    density: 0.4,
  });
  const conwayVisual = new RealConwayVisual(conway);
  const explorer = new ExplorerEngine(gpu.device, explorerCanvas, seed, {
    overlay: true,
  });
  const explorerVisual = new RealRuleSpaceVisual(explorer, seed);

  const ltl = new LtLEngine(gpu.device, ltlCanvas, 128, 128, seed, { overlay: true });
  const ltlVisual = new RealLtLVisual(ltl, (meta) => zm.setHudMeta('ltl', meta));
  ltlVisual.setParam('preset', 0);

  const lenia = new LeniaEngine(gpu.device, leniaCanvas, 160, 160, seed, { overlay: true });
  lenia.setGrowth(ORBIUM_PARAMS.mu, ORBIUM_PARAMS.sigma);
  lenia.setKernel(ORBIUM_PARAMS.R, ORBIUM_PARAMS.betas);

  const placeSpecies = (idx: number): void => {
    const sp = SPECIES[idx];
    if (!sp || !sp.cells.length) return;
    if (sp.key === 'orbium') {

      lenia.place([
        { cells: sp.cells, x: 20, y: 8 },
        { cells: sp.cells, x: 100, y: 8 },
        { cells: sp.cells, x: 47, y: 61 },
        { cells: sp.cells, x: 127, y: 61 },
        { cells: sp.cells, x: 74, y: 114 },
        { cells: sp.cells, x: 154, y: 114 },
      ]);
    } else if (sp.key === 'gyrorbium') {

      const mirrored = sp.cells.map((r) => [...r].reverse());
      lenia.place([
        { cells: sp.cells, x: 24, y: 24 },
        { cells: mirrored, x: 104, y: 30 },
        { cells: mirrored, x: 30, y: 100 },
        { cells: sp.cells, x: 110, y: 104 },
      ]);
    } else {

      lenia.place([
        { cells: sp.cells, x: 12, y: 20 },
        { cells: sp.cells, x: 66, y: 73 },
        { cells: sp.cells, x: 120, y: 126 },
      ]);
    }
  };
  placeSpecies(0);
  const leniaVisual = new RealLeniaVisual(lenia, placeSpecies);

  const rd = new RDEngine(gpu.device, rdCanvas, 256, 256, seed, { overlay: true });
  const rdVisual = new RealRDVisual(rd);
  let nca: NCAEngine;
  try {

    nca = await loadNCA(gpu.device, ncaCanvas, 'butterfly', seed, { overlay: true, grid: NCA_GRID });
  } catch (e) {
    console.warn('[LR] NCA weights unavailable, keeping the fake', e);
    conway.dispose();
    explorer.dispose();
    ltl.dispose();
    lenia.dispose();
    rd.dispose();
    conwayCanvas.remove();
    explorerCanvas.remove();
    ltlCanvas.remove();
    leniaCanvas.remove();
    rdCanvas.remove();
    ncaCanvas.remove();
    return null;
  }
  visuals['conway'] = conwayVisual;
  visuals['rulespace'] = explorerVisual;
  visuals['ltl'] = ltlVisual;
  visuals['lenia'] = leniaVisual;
  visuals['rd'] = rdVisual;
  visuals['nca'] = new RealNCAVisual(nca);
  zm.realLayers.conway = true;
  zm.realLayers.rulespace = true;
  zm.realLayers.ltl = true;
  zm.realLayers.lenia = ORBIUM_CELLS.length > 0;
  zm.realLayers.rd = true;
  zm.realLayers.nca = true;

  const hoverSurface = document.createElement('div');
  hoverSurface.setAttribute('data-explorer-hover', '');
  hoverSurface.setAttribute('aria-hidden', 'true');
  hoverSurface.style.cssText =
    'position:fixed;z-index:1;display:none;pointer-events:auto;cursor:crosshair;';
  const hoverChip = document.createElement('div');
  hoverChip.style.cssText =
    "position:absolute;padding:5px 10px;border:1px solid #232741;border-radius:2px;background:rgba(12,13,24,0.82);font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.08em;color:#9A9AB8;font-variant-numeric:tabular-nums;white-space:nowrap;pointer-events:none;opacity:0;transition:opacity 0.25s ease;";
  hoverSurface.appendChild(hoverChip);
  document.body.appendChild(hoverSurface);
  hoverSurface.addEventListener('pointermove', (e) => {
    const r = hoverSurface.getBoundingClientRect();
    if (r.width <= 0) return;
    const tx = Math.min(
      EXPLORER_TILES - 1,
      Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * EXPLORER_TILES)),
    );
    const ty = Math.min(
      EXPLORER_TILES - 1,
      Math.max(0, Math.floor(((e.clientY - r.top) / r.height) * EXPLORER_TILES)),
    );
    const t = ty * EXPLORER_TILES + tx;
    explorer.setHover(t);
    const rule = explorer.rules[t]!;
    const name = ruleName(rule);
    hoverChip.textContent = `${formatRule(rule)}${name ? ` · ${name.toUpperCase()}` : ''}`;
    hoverChip.style.opacity = '1';
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    hoverChip.style.left = `${Math.min(cx + 14, r.width - hoverChip.offsetWidth - 4)}px`;
    hoverChip.style.top = `${Math.max(cy - 34, 4)}px`;
  });
  hoverSurface.addEventListener('pointerleave', () => {
    explorer.setHover(null);
    hoverChip.style.opacity = '0';
  });

  const stepEl = document.querySelector<HTMLElement>('[data-step]');
  let conwayAcc = 0;
  let explorerAcc = 0;
  let conwayVisible = false;
  let explorerVisible = false;
  let ltlVisible = false;
  let ltlAcc = 0;
  let leniaAcc = 0;
  let leniaVisible = false;
  let leniaRespawnArmed = true;
  let leniaRespawnEpoch = -1;
  let rdVisible = false;
  let rdRespawnArmed = true;
  let rdRespawnEpoch = -1;
  let ncaVisible = false;
  let biteArmed = true;
  let biteT0 = -1;
  let cutting = false;

  let lastClimaxPs = 0;
  let lastT = performance.now();
  let lastStepShown = -1;

  setCutBackend({
    begin: (lx, ly) => {
      cutting = true;
      nca.setBrush(
        ((lx * NCA_LOCAL + 1) / 2) * nca.w,
        ((1 - ly * NCA_LOCAL) / 2) * nca.h,
        (nca.w * NCA_LOCAL) / 10,
      );
    },
    move: (lx, ly) => {
      if (cutting)
        nca.setBrush(
          ((lx * NCA_LOCAL + 1) / 2) * nca.w,
          ((1 - ly * NCA_LOCAL) / 2) * nca.h,
          (nca.w * NCA_LOCAL) / 10,
        );
    },
    end: () => {
      cutting = false;
      nca.clearBrush();
    },
  });

  const onEngineFrame = (info: EngineFrameInfo): void => {
    const now = performance.now();
    const dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    const rect = host.subjectRect();
    const dpr = DPR();
    const narrow = innerWidth < 900;

    const cFade = chFade(info.wConway) * (narrow ? 0.55 : 1);
    if (cFade > 0.004) {
      conwayVisible = true;
      conway.setFade(cFade);
      conway.setViewport(
        ...fitSquare(conwayCanvas.width, conwayCanvas.height, rect.cx * dpr, rect.cy * dpr, rect.size * dpr),
      );
      conwayAcc += dt * conwayVisual.stepsPerSec;
      const steps = Math.floor(conwayAcc);
      conwayAcc -= steps;
      conway.tick(Math.min(steps, 8));
    } else if (conwayVisible) {
      conwayVisible = false;
      conway.setFade(0);
      conway.tick(0);
    }

    const eFade = chFade(info.wRule) * (narrow ? 0.55 : 1);
    if (eFade > 0.004) {
      explorerVisible = true;
      explorer.setFade(eFade);
      const [evx, evy, evs] = fitSquare(
        explorerCanvas.width,
        explorerCanvas.height,
        rect.cx * dpr,
        rect.cy * dpr,
        rect.size * dpr,
      );
      explorer.setViewport(evx, evy, evs, evs);
      explorerAcc += dt * explorerVisual.stepsPerSec;
      const steps = Math.floor(explorerAcc);
      explorerAcc -= steps;
      explorer.tick(Math.min(steps, 8));
      if (chFade(info.wRule) > 0.5 && !narrow) {

        hoverSurface.style.display = 'block';
        hoverSurface.style.left = `${evx / dpr}px`;
        hoverSurface.style.top = `${evy / dpr}px`;
        hoverSurface.style.width = `${evs / dpr}px`;
        hoverSurface.style.height = `${evs / dpr}px`;
      } else {
        hoverSurface.style.display = 'none';
      }
    } else if (explorerVisible) {
      explorerVisible = false;
      explorer.setFade(0);
      explorer.tick(0);
      hoverSurface.style.display = 'none';
    }

    const tFade = chFade(info.wLtl) * (narrow ? 0.55 : 1);
    if (tFade > 0.004) {
      ltlVisible = true;
      ltl.setFade(tFade);
      ltl.setViewport(
        ...fitSquare(ltlCanvas.width, ltlCanvas.height, rect.cx * dpr, rect.cy * dpr, rect.size * dpr),
      );

      ltlAcc += dt * ltlVisual.gensPerSec;
      const steps = Math.floor(ltlAcc);
      ltlAcc -= steps;
      ltl.tick(Math.min(steps, 8));
    } else if (ltlVisible) {
      ltlVisible = false;
      ltl.setFade(0);
      ltl.tick(0);
    }

    if (zm.realLayers.lenia) {
      const lFade = chFade(info.wLenia) * (narrow ? 0.55 : 1);
      if (lFade > 0.004) {
        leniaVisible = true;
        lenia.setFade(lFade);
        lenia.setViewport(
          ...fitSquare(leniaCanvas.width, leniaCanvas.height, rect.cx * dpr, rect.cy * dpr, rect.size * dpr),
        );

        leniaAcc += dt * leniaVisual.stepsPerSec;
        const lSteps = Math.floor(leniaAcc);
        leniaAcc -= lSteps;
        lenia.tick(Math.min(lSteps, 4));

        if (lenia.stats.frame > 60 && lenia.stats.mass < 1) {
          if (leniaRespawnArmed || leniaVisual.paramEpoch !== leniaRespawnEpoch) {
            leniaRespawnArmed = false;
            leniaRespawnEpoch = leniaVisual.paramEpoch;
            placeSpecies(leniaVisual.speciesIdx);
          }
        }
      } else if (leniaVisible) {
        leniaVisible = false;
        leniaRespawnArmed = true;
        lenia.setFade(0);
        lenia.tick(0);
      }
    }

    const rFade = chFade(info.wRD) * (narrow ? 0.55 : 1);
    if (rFade > 0.004) {
      rdVisible = true;
      rd.setFade(rFade);
      rd.setViewport(
        ...fitSquare(rdCanvas.width, rdCanvas.height, rect.cx * dpr, rect.cy * dpr, rect.size * dpr),
      );

      rd.tick(rdVisual.stepsPerFrame);

      if (rd.stats.frame > 60 && rd.stats.vMass < 2) {
        if (rdRespawnArmed || rdVisual.paramEpoch !== rdRespawnEpoch) {
          rdRespawnArmed = false;
          rdRespawnEpoch = rdVisual.paramEpoch;
          rd.reseed();
        }
      }
    } else if (rdVisible) {
      rdVisible = false;
      rdRespawnArmed = true;
      rd.setFade(0);
      rd.tick(0);
    }

    const nFade = Math.min(1, chFade(info.wClimax) * 1.15);
    if (nFade > 0.004) {
      ncaVisible = true;
      nca.setFade(nFade);
      nca.setPeel(info.peel);

      const span = (rect.size / 64) * NCA_GRID * dpr;
      const cw = ncaCanvas.width;
      const chh = ncaCanvas.height;
      nca.setPeelScale(NCA_LOCAL);
      nca.setQuadScale(
        span / cw,
        span / chh,
        (rect.cx * dpr - cw / 2) / (cw / 2),
        -((rect.cy * dpr - chh / 2) / (chh / 2)),
      );
      nca.setViewport(0, 0, cw, chh);
      const ps = info.climaxPs;

      if (!cutting && biteArmed && lastClimaxPs < 0.68 && ps >= 0.68) {
        biteArmed = false;
        biteT0 = now;
      }
      if (biteT0 >= 0) {
        if (cutting || now - biteT0 >= 350) {
          if (!cutting) nca.clearBrush();
          biteT0 = -1;
        } else {
          const open = Math.pow((now - biteT0) / 350, 0.75);
          nca.setBrush(
            ((0.3 * NCA_LOCAL + 1) / 2) * nca.w,
            ((1 - 0.16 * NCA_LOCAL) / 2) * nca.h,
            open * 0.22 * nca.w * NCA_LOCAL,
          );
        }
      }

      if (ps < 0.55 && !biteArmed) biteArmed = true;

      if (ps < 0.02) {
        if (nca.step > 0 && !cutting) nca.reset();
        nca.tick(0);
      } else {
        nca.tick(1);
      }
      lastClimaxPs = ps;
      if (stepEl && nca.step !== lastStepShown) {
        stepEl.textContent = 'STEP ' + String(nca.step).padStart(3, '0');
        lastStepShown = nca.step;
      }
    } else if (ncaVisible) {
      ncaVisible = false;
      nca.setFade(0);
      nca.tick(0);
    }
  };

  zm.setEngineHook(onEngineFrame);

  window.addEventListener('resize', () => {
    sizeCanvas(conwayCanvas);
    sizeCanvas(explorerCanvas);
    sizeCanvas(ltlCanvas);
    sizeCanvas(leniaCanvas);
    sizeCanvas(rdCanvas);
    sizeCanvas(ncaCanvas);
  });

  return { adapterInfo: gpu.adapterInfo };
}
