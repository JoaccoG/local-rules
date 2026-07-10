

import gsap from 'gsap';
import { clamp, seg, hex2v, lerp3, easeOutCubic, type Vec3 } from '../lib/math';
import { ladderColor } from '../visuals/ladder';
import { fakeMode, type FakeName, type VisualHost } from '../visuals/fakes';
import type { GLTargets } from '../visuals/gl/SceneGL';
import type { Prefs } from '../state/motionPrefs';

interface Zone {
  el: HTMLElement;
  kind: string;
  chapter: string | null;
  top: number;
  h: number;
  mode: number;
  accent: string | null;
  bloomM: number;
  hud: { num: string; name: string; meta: string } | null;
}

export interface EngineFrameInfo {

  wClimax: number;

  wConway: number;

  wRule: number;

  wLtl: number;

  wLenia: number;

  wRD: number;

  climaxPs: number;

  gseg: number;

  peel: number;
}

interface ZoneParams {
  field: number;
  amp: number;
  subj: number;
  tint: number;
  bloomM: number;
  mask: number;
  grow: number;
  mode: number;
  cx: number;
  cy: number;
  scale: number;
  accent: Vec3;
  bgBase: string;
}

export interface ZoneMachineHooks {

  onThesisProgress?: (ps: number) => void;

  onZoneChange?: (kind: string, visual: string | null, accent: string | null) => void;

  onFrame?: (scrollY: number, accent: Vec3) => void;

  onEngineFrame?: (info: EngineFrameInfo) => void;
}

export class ZoneMachine {
  private Z: Zone[] = [];
  private docH = 0;
  private heroMask: { cx: number; cyDoc: number; rx: number; ry: number } | null = null;
  private cycAcc: Vec3 = hex2v('#4DE1FF');
  private t = 0;
  private active = -1;
  private lastStep = -1;
  private stepEl: HTMLElement | null = null;
  private labels: HTMLElement[] = [];
  private cz: Zone | undefined;
  private tz: Zone | undefined;
  preOpen = false;

  realLayers = { conway: false, rulespace: false, ltl: false, lenia: false, rd: false, nca: false };

  private climaxUiActive = false;
  private manualBite = 0;
  private manualHeal = 0;

  setEngineHook(fn: (info: EngineFrameInfo) => void): void {
    this.hooks.onEngineFrame = fn;
  }

  cut(bite: number): void {
    this.manualBite = clamp(bite, 0, 1);
    this.manualHeal = 0;
  }

  release(): void {
    if (this.manualBite > 0) this.manualHeal = 1 / 150;
  }

  constructor(
    private host: VisualHost,
    private prefs: Prefs,
    private hooks: ZoneMachineHooks = {},
    private getScrollY: () => number = () => window.scrollY || 0,
    private getPalette: () => { a: Vec3; b: Vec3 } = () => ({
      a: hex2v('#4DE1FF'),
      b: hex2v('#8B5CF6'),
    }),
  ) {}

  measure(): void {
    const y = window.scrollY || 0;
    this.Z = Array.from(document.querySelectorAll<HTMLElement>('[data-zone]')).map((el) => {
      const r = el.getBoundingClientRect();
      const visual = el.getAttribute('data-visual') as FakeName | null;
      return {
        el,
        kind: el.getAttribute('data-zone') ?? '',
        chapter: el.getAttribute('data-chapter'),
        top: r.top + y,
        h: r.height,
        mode: visual ? fakeMode(visual) : 0,
        accent: el.getAttribute('data-accent'),
        bloomM: parseFloat(el.getAttribute('data-bloomm') ?? '1'),
        hud: el.hasAttribute('data-hudnum')
          ? {
              num: el.getAttribute('data-hudnum')!,
              name: el.getAttribute('data-hudname')!,
              meta: el.getAttribute('data-hudmeta')!,
            }
          : null,
      };
    });
    this.cz = this.Z.find((z) => z.kind === 'climax');
    this.tz = this.Z.find((z) => z.kind === 'thesis');
    this.docH = document.documentElement.scrollHeight;
    const h1 = document.querySelector<HTMLElement>('[data-hero-h1]');
    if (h1) {
      const r = h1.getBoundingClientRect();
      this.heroMask = {
        cx: r.left + r.width / 2,
        cyDoc: r.top + y + r.height / 2,
        rx: r.width * 0.62,
        ry: r.height * 0.8,
      };
    }
    this.stepEl = document.querySelector('[data-step]');
    this.labels = Array.from(document.querySelectorAll<HTMLElement>('[data-beat-label]'));
  }

  private zp(z: Zone): ZoneParams {
    const W = window.innerWidth;
    const vh = window.innerHeight;
    const narrow = W < 900;
    const base: ZoneParams = {
      field: 0.3,
      amp: 0.34,
      subj: 0,
      tint: 0.5,
      bloomM: 1,
      mask: 0,
      grow: 1,
      mode: z.mode || 0,
      cx: 0,
      cy: 0,
      scale: Math.min(W, vh) * 0.68,
      accent: hex2v(z.accent || '#8B5CF6'),
      bgBase: '#0C0D18',
    };
    switch (z.kind) {
      case 'hero':
        return {
          ...base,
          field: 1.05,
          amp: 0.58,
          tint: 0.12,
          accent: hex2v('#4DE1FF'),
          bgBase: '#06070D',
          mask: 1,
        };
      case 'thesis':
        return { ...base, field: 0.15, amp: 0.3, tint: 0.3, bloomM: 0.8, accent: hex2v('#8B5CF6') };
      case 'dials':
        return { ...base, field: 0.12, amp: 0.28, tint: 0.3, bloomM: 0.7, accent: hex2v('#8B5CF6') };
      case 'ch': {
        const contentW = Math.min(1440, W);
        const left = (W - contentW) / 2 + (narrow ? 24 : 80);
        const inner = contentW - (narrow ? 48 : 160);
        const unit = (inner - 24 * 11) / 12;
        const visW = narrow ? inner : unit * 7 + 24 * 6;
        const cxPx = left + visW / 2;
        return {
          ...base,
          field: 0.3,

          grow: 0.05,
          subj: z.mode === 5 ? 1.2 : narrow ? 0.55 : 1,
          tint: 0.55,
          bloomM: z.bloomM,
          cx: narrow ? 0 : (cxPx / W) * 2 - 1,
          scale: narrow ? W * 0.85 : Math.min(visW * 0.92, vh * 0.76),
          accent: hex2v(z.accent!),
        };
      }
      case 'ncaintro':
        return {
          ...base,
          field: 0.22,
          subj: 0.85,
          grow: 0.05,
          bloomM: 1.1,
          mode: 7,
          accent: this.cycAcc,
          scale: Math.min(W, vh) * 0.7,
        };
      case 'climax':
        return {
          ...base,
          field: 0.28,
          subj: 1.15,
          bloomM: 1.45,
          mode: 7,
          accent: this.cycAcc,

          scale: Math.min(W, vh) * (narrow ? 0.44 : 0.7),
        };
      case 'trained':

        return { ...base, field: 0.16, tint: 0.3, bloomM: 0.8, accent: this.cycAcc };
      case 'instrument':
        return { ...base, field: 0.1, tint: 0.2, bloomM: 0.6, accent: hex2v('#3A4068') };
      case 'colophon':
        return {
          ...base,
          field: 0.7,
          amp: 0.22,
          tint: 0.55,
          bloomM: 1.1,
          accent: hex2v('#4DE1FF'),
          bgBase: '#06070D',
        };
    }
    return base;
  }

  frame(): void {
    const Z = this.Z;
    if (!Z.length) return;
    const y = this.getScrollY();
    const vh = window.innerHeight;
    this.t += 1 / 60;
    this.cycAcc = ladderColor(this.t * 0.045);
    const posC = y + vh * 0.55;
    let i = 0;
    for (let k = 0; k < Z.length; k++) if (Z[k]!.top <= posC) i = k;
    const z = Z[i]!;
    const zp = Z[i - 1] ?? z;
    const B = vh * 0.5;
    const f = i === 0 ? 1 : seg(posC, z.top, z.top + B);
    const pa = this.zp(zp);
    const pb = this.zp(z);
    const mixN = (a: number, b: number) => a + (b - a) * f;
    const acc = lerp3(pa.accent, pb.accent, f);
    const bg = lerp3(
      lerp3(hex2v(pa.bgBase), pa.accent, 0.05),
      lerp3(hex2v(pb.bgBase), pb.accent, 0.05),
      f,
    );
    const T: Required<Omit<GLTargets, 'palA' | 'palB'>> & Pick<GLTargets, 'palA' | 'palB'> = {
      field: mixN(pa.field, pb.field),
      amp: mixN(pa.amp, pb.amp) * (this.prefs.calm ? 0.75 : 1),
      subj: mixN(pa.subj, pb.subj),
      tintAmt: mixN(pa.tint, pb.tint),
      bloom: this.prefs.bloom * mixN(pa.bloomM, pb.bloomM),
      maskAmt: 0.55 * mixN(pa.mask, pb.mask),
      cx: mixN(pa.cx, pb.cx),
      cy: mixN(pa.cy, pb.cy),
      scalePx: mixN(pa.scale, pb.scale),
      chA: pa.mode,
      chB: pb.mode,
      chMix: pa.mode === pb.mode ? 1 : f,
      grow: mixN(pa.grow, pb.grow),
      peel: 0,
      bite: 0,
      heal: 0,
      accent: acc,
      bg,
      expand: 1,
      palA: this.getPalette().a,
      palB: this.getPalette().b,
    };
    if (!this.preOpen) {
      T.expand = 0.06;
      T.field = 0.5;
    }
    const cz = this.cz;
    let climaxPs = 0;
    let gsegOut = 0;
    if (cz && (z.kind === 'climax' || zp.kind === 'climax')) {
      const ps = clamp((y - cz.top) / (cz.h - vh), 0, 1);
      const gseg = easeOutCubic(seg(ps, 0.02, 0.3));
      climaxPs = ps;
      gsegOut = gseg;
      T.grow = 0.05 + 0.95 * gseg;

      T.peel = seg(ps, 0.16, 0.3) * (1 - seg(ps, 0.5, 0.6));
      const heal = seg(ps, 0.76, 0.92);
      T.bite = seg(ps, 0.62, 0.72) * (1 - heal);
      T.heal = Math.sin(heal * Math.PI);
      if (!this.prefs.reducedMotion) {
        const steps = Math.round(gseg * 128);

        const l0 = seg(ps, 0.02, 0.06);

        const l1 = seg(ps, 0.16, 0.2);
        const l2 = seg(ps, 0.5, 0.6);
        if (this.stepEl) {
          this.stepEl.style.opacity = String(l0);

          if (!this.realLayers.nca && this.lastStep !== steps) {
            this.stepEl.textContent = 'STEP ' + String(steps).padStart(3, '0');
            this.lastStep = steps;
          }
        }
        [l0, l1, l2].forEach((v, k) => {
          const el = this.labels[k];
          if (el) {
            el.style.opacity = String(v);
            el.style.transform = `translateY(${(1 - v) * 14}px)`;
          }
        });
      }
    }
    if (!(cz && (z.kind === 'climax' || zp.kind === 'climax'))) {

      if (this.climaxUiActive) {
        this.climaxUiActive = false;
        if (this.stepEl) this.stepEl.style.opacity = '0';
        for (const el of this.labels) el.style.opacity = '0';
      }
    } else {
      this.climaxUiActive = true;
    }

    if (this.hooks.onEngineFrame) {
      const wClimax =
        (zp.kind === 'climax' ? 1 - f : 0) + (z.kind === 'climax' ? f : 0);
      const wConway =
        (zp.chapter === '1' ? 1 - f : 0) + (z.chapter === '1' ? f : 0);
      const wRule =
        (zp.chapter === '2' ? 1 - f : 0) + (z.chapter === '2' ? f : 0);
      const wLtl =
        (zp.chapter === '3' ? 1 - f : 0) + (z.chapter === '3' ? f : 0);
      const wLenia =
        (zp.chapter === '4' ? 1 - f : 0) + (z.chapter === '4' ? f : 0);
      const wRD =
        (zp.chapter === '5' ? 1 - f : 0) + (z.chapter === '5' ? f : 0);

      const realOf = (zz: Zone): boolean => {
        if (zz.kind === 'climax') return this.realLayers.nca;
        if (zz.kind !== 'ch') return false;
        const v = zz.el.getAttribute('data-visual');
        if (v === 'conway') return this.realLayers.conway;
        if (v === 'rulespace') return this.realLayers.rulespace;
        if (v === 'ltl') return this.realLayers.ltl;
        if (v === 'lenia') return this.realLayers.lenia;
        if (v === 'rd') return this.realLayers.rd;
        return false;
      };
      const ra = realOf(zp);
      const rb = realOf(z);
      if (ra && rb) T.subj = 0;
      else if (ra) {
        T.chMix = 1;
        T.subj *= f;
      } else if (rb) {
        T.chMix = 0;
        T.subj *= 1 - f;
      }
      this.hooks.onEngineFrame({
        wClimax,
        wConway,
        wRule,
        wLtl,
        wLenia,
        wRD,
        climaxPs,
        gseg: gsegOut,
        peel: T.peel,
      });
    }
    if (!this.prefs.reducedMotion && this.hooks.onThesisProgress && this.tz) {
      const tz = this.tz;
      const ps = clamp((y - tz.top) / (tz.h - vh), 0, 1);
      this.hooks.onThesisProgress(ps);
    }
    if (this.manualBite > 0 || this.manualHeal > 0) {
      T.bite = Math.max(T.bite, this.manualBite * (1 - this.manualHeal));
      T.heal = Math.max(T.heal, Math.sin(this.manualHeal * Math.PI));

      if (this.manualHeal > 0) {
        this.manualHeal = Math.min(1, this.manualHeal + 1 / 150);
        if (this.manualHeal >= 1) {
          this.manualBite = 0;
          this.manualHeal = 0;
        }
      }
    } else if (T.bite > 0) {

      this.host.setBiteSegment(0.3, 0.16, 0.3, 0.16);
    }
    if (this.docH) {
      const pcol = seg(y + vh, this.docH - vh * 1.5, this.docH - 8);
      if (pcol > 0) {
        T.expand = Math.min(T.expand, 1 - 0.94 * pcol);
        T.amp = T.amp * (1 - pcol);
        T.field = Math.max(T.field * (1 - pcol * 0.5), 0.4);
        T.tintAmt = Math.max(T.tintAmt, 0.6 * pcol);
      }
    }
    const active = f > 0.5 ? i : Math.max(0, i - 1);
    if (active !== this.active) {
      const za = Z[active];
      const zpv = Z[this.active < 0 ? 0 : this.active];
      if (
        !this.prefs.calm &&
        !this.prefs.reducedMotion &&
        this.host.alive &&
        ((za && za.mode) || (zpv && zpv.mode))
      ) {
        this.host.pulse(0.9);
      }
      this.active = active;
      this.hud(za);
      this.hooks.onZoneChange?.(
        za?.kind ?? '',
        za?.el.getAttribute('data-visual') ?? null,
        za?.accent ?? null,
      );
    }
    this.hooks.onFrame?.(y, acc);
    if (this.heroMask && this.host.alive) {
      const dpr = this.host.dpr;
      const cyCss = this.heroMask.cyDoc - y;
      this.host.setMask(
        this.heroMask.cx * dpr,
        (vh - cyCss) * dpr,
        this.heroMask.rx * dpr,
        this.heroMask.ry * dpr,
      );
    }
    this.host.setTargets(T);
  }

  private lastHud: Zone | undefined;

  setHudMeta(visual: string, meta: string): void {
    const z = this.Z.find((zz) => zz.el.getAttribute('data-visual') === visual && zz.hud);
    if (!z || !z.hud) return;
    z.hud.meta = meta;
    z.el.setAttribute('data-hudmeta', meta);
    if (this.lastHud === z) {
      const el = document.querySelector<HTMLElement>('[data-hud-meta]');
      if (el) el.textContent = meta;
    }
  }

  private hud(z: Zone | undefined): void {
    const hud = document.querySelector<HTMLElement>('[data-hud]');
    if (!hud) return;
    const show = !!(z && z.kind === 'ch' && z.hud);
    this.lastHud = show ? z : undefined;
    if (show && z && z.hud) {
      const num = document.querySelector<HTMLElement>('[data-hud-num]');
      const name = document.querySelector<HTMLElement>('[data-hud-name]');
      const meta = document.querySelector<HTMLElement>('[data-hud-meta]');
      const line = document.querySelector<HTMLElement>('[data-hud-line]');
      if (num) {
        num.textContent = z.hud.num;
        num.style.color = z.accent ?? '';
      }
      if (name) name.textContent = z.hud.name;
      if (meta) meta.textContent = z.hud.meta;
      if (line) line.style.background = (z.accent ?? '') + '55';
    }
    gsap.to(hud, { autoAlpha: show ? 1 : 0, duration: 0.5, ease: 'power2.out' });
  }
}
