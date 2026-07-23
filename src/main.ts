

import gsap from 'gsap';
import ScrollTrigger from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { headerHTML, preloaderHTML, hudHTML } from './sections/fixtures';
import { heroHTML, thesisHTML, dialsHTML } from './sections/opening';
import { CHAPTERS, chapterHTML } from './sections/chapters';
import { ncaIntroHTML, climaxHTML, trainedHTML, instrumentHTML, colophonHTML } from './sections/closing';
import { VisualHost, createFakeVisual } from './visuals/fakes';
import { ZoneMachine } from './motion/zones';
import { ThesisBeats } from './motion/thesis';
import { setupReveals } from './motion/reveals';
import { preCount, finishPre, heroIn, staticLayout } from './motion/intro';
import { readPrefs } from './state/motionPrefs';
import { Chrome } from './motion/chrome';
import { mountInstrumentCursor } from './state/cursor';
import { CanvasRecorder } from './lib/exportVideo';
import { PALETTES, paletteById, mixPalettes, type Palette } from './state/palette';
import { readStateFromLocation, writeStateToLocation, type ShareState } from './state/urlState';
import { ControlRail } from './sections/controls';
import { mountCutSurface, setCutSurfaceActive, mountFkMap } from './motion/interactions';
import { mountDialTooltips } from './sections/tooltips';
import { mountBestiaryPanel } from './sections/bestiaryPanel';
import type { Vec3 } from './lib/math';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function boot(): Promise<void> {
  const prefs = readPrefs();
  const shared = await readStateFromLocation();
  const app = document.querySelector<HTMLElement>('#app')!;
  app.innerHTML = [
    heroHTML,
    thesisHTML,
    dialsHTML,
    ...CHAPTERS.map(chapterHTML),
    ncaIntroHTML,
    climaxHTML,
    trainedHTML,
    instrumentHTML,
    colophonHTML,
  ].join('\n');
  document.body.insertAdjacentHTML('beforeend', headerHTML + hudHTML + preloaderHTML);

  document.body.style.overflow = 'hidden';
  gsap.registerPlugin(ScrollTrigger);

  const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-gl]')!;
  const host = new VisualHost();
  const seed = shared?.seed ?? 1;
  const alive = host.init(canvas, {
    density: prefs.density,
    bloom: shared?.prefs?.bloom ?? prefs.bloom,
    grain: shared?.prefs?.grain ?? prefs.grain,
    freeze: prefs.reducedMotion,
    seed,
  });
  if (!alive) canvas.style.display = 'none';

  const visuals = Object.fromEntries(
    CHAPTERS.map((c) => [c.visual, createFakeVisual(c.visual, host)]),
  );

  let palette: Palette = paletteById(shared?.pal ?? 'spectral');
  let palettePair = { a: palette.a, b: palette.b };
  const shareParams: Record<string, Record<string, number>> = shared?.params ?? {};
  const pushState = () => {
    const s: ShareState = {
      v: 1,
      seed,
      pal: palette.id,
      prefs: {
        motion: prefs.motion,
        density: prefs.density,
        bloom: shared?.prefs?.bloom ?? prefs.bloom,
        grain: shared?.prefs?.grain ?? prefs.grain,
      },
      params: shareParams,
    };
    writeStateToLocation(s);
  };
  const switchPalette = (to: Palette) => {
    const from = palette;
    palette = to;
    if (prefs.reducedMotion) {
      palettePair = { a: to.a, b: to.b };
    } else {
      const t0 = performance.now();
      const anim = () => {
        const t = Math.min(1, (performance.now() - t0) / 600);
        palettePair = mixPalettes(from, to, t);
        if (t < 1) requestAnimationFrame(anim);
      };
      requestAnimationFrame(anim);
    }
    pushState();
  };

  const preDone = preCount(prefs.reducedMotion);
  const fontsReady = Promise.race([document.fonts?.ready ?? Promise.resolve(), delay(2600)]);
  await Promise.all([preDone, fontsReady]);

  let lenis: Lenis | null = null;
  const thesis = new ThesisBeats();
  if (!prefs.reducedMotion) {
    lenis = new Lenis({ duration: 1.1 });
    lenis.on('scroll', ScrollTrigger.update);
    thesis.build();
  } else {
    staticLayout();
  }
  setupReveals(prefs.reducedMotion);

  const chrome = new Chrome({ lenis, reducedMotion: prefs.reducedMotion });

  let fkHandle: { set: (regime: number) => void } | undefined;
  const rail = new ControlRail(
    visuals,
    (visual, key, value) => {
      (shareParams[visual] ??= {})[key] = value;
      if (visual === 'rd' && key === 'regime') fkHandle?.set(value);
      pushState();
    },
    shareParams,
  );
  const recorder = new CanvasRecorder(canvas, (s) => chrome.setRecording(true, s));

  const v3hex = (v: Vec3) =>
    '#' +
    v.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('');

  const zm = new ZoneMachine(
    host,
    prefs,
    {
      ...(prefs.reducedMotion ? {} : { onThesisProgress: thesis.progress }),
      onZoneChange: (kind, visual, accent) => {

        rail.setChapter(kind === 'ch' ? (visual as never) : kind === 'climax' ? 'nca' : null, accent);
        setCutSurfaceActive(kind === 'climax');
      },
      onFrame: (scrollY, accent) => chrome.frame(scrollY, v3hex(accent)),
    },
    () => (lenis ? lenis.scroll : window.scrollY || 0),
    () => palettePair,
  );
  zm.measure();
  if (prefs.reducedMotion) zm.preOpen = true;

  mountCutSurface(zm, host);

  const replayShared = (): void => {
    for (const [visual, params] of Object.entries(shareParams)) {
      for (const [key, value] of Object.entries(params)) visuals[visual]?.setParam(key, value);
    }
  };

  void import('./engine/integration').then(({ attachEngines }) =>
    attachEngines({ zm, host, visuals, prefs, seed }).then((att) => {
      if (att) {
        console.info(`[LR] real engines attached — ${att.adapterInfo}`);
        replayShared();
      }
    }),
  );
  fkHandle = mountFkMap(
    () => visuals['rd'],
    (F, k, regime) => {
      (shareParams['rd'] ??= {})['F'] = F;
      shareParams['rd']!['k'] = k;
      shareParams['rd']!['regime'] = regime;
      rail.setValue('rd', 'regime', regime);
      pushState();
    },
    shareParams['rd']
      ? { F: shareParams['rd']['F'], k: shareParams['rd']['k'] }
      : { F: 0.0367, k: 0.0649 },
  );
  mountInstrumentCursor(prefs.reducedMotion);
  mountDialTooltips(prefs.reducedMotion);
  mountBestiaryPanel();
  chrome.measureZones();
  chrome.bindKeys(
    async () => {
      pushState();
      await delay(300);
      try {
        await navigator.clipboard.writeText(location.href);
        chrome.toast('URL copied');
      } catch {
        chrome.toast('Copy failed — copy from the address bar');
      }
    },
    () => {
      if (recorder.active) {
        recorder.stop();
        chrome.setRecording(false);
        chrome.toast('WebM saved');
      } else if (recorder.start()) {
        chrome.toast('Recording — E to stop');
      }
    },
  );
  window.addEventListener('keydown', (e) => {
    if (e.key === 'p' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const i = PALETTES.findIndex((p) => p.id === palette.id);
      const nextPalette = PALETTES[(i + 1) % PALETTES.length]!;
      switchPalette(nextPalette);
      chrome.toast(`Palette — ${nextPalette.name}`);
    }
  });

  replayShared();

  const onResize = () => {
    zm.measure();
    chrome.measureZones();
    host.resize();
    ScrollTrigger.refresh();
  };
  window.addEventListener('resize', onResize);

  const loop = (t: number) => {
    requestAnimationFrame(loop);
    if (lenis) lenis.raf(t);
    zm.frame();
  };
  requestAnimationFrame(loop);

  (window as unknown as Record<string, unknown>).__LR = { lenis, zm, host };

  zm.preOpen = true;
  await finishPre(prefs.reducedMotion);
  document.body.style.overflow = '';
  heroIn(prefs.reducedMotion);
  ScrollTrigger.refresh();
}

void boot();
