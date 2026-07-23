

import { LTL_PRESETS, NCA_CREATURES, RD_REGIMES } from '../engine/regimes';
import { SPECIES } from '../engine/species';
import type { ChapterVisual } from '../visuals/ChapterVisual';
import type { FakeName } from '../visuals/fakes';

interface Param {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  fmt?: (v: number) => string;
}

const fmt3 = (v: number) => v.toFixed(3);
const fmt2 = (v: number) => v.toFixed(2);
const fmt0 = (v: number) => String(Math.round(v));

const PARAMS: Record<FakeName, Param[]> = {

  conway: [
    { key: 'density', label: 'Density', min: 0.1, max: 0.5, step: 0.01, value: 0.4, fmt: fmt2 },
    { key: 'speed', label: 'Speed', min: 1, max: 10, step: 1, value: 6, fmt: fmt0 },
  ],
  rulespace: [
    { key: 'worlds', label: 'Worlds', min: 0, max: 0.5, step: 0.01, value: 0.14, fmt: fmt2 },
    { key: 'speed', label: 'Speed', min: 1, max: 10, step: 1, value: 6, fmt: fmt0 },
  ],

  ltl: [{ key: 'speed', label: 'Speed', min: 1, max: 10, step: 1, value: 6, fmt: fmt0 }],
  smoothlife: [
    { key: 'b0', label: 'Birth lo', min: 0.2, max: 0.4, step: 0.001, value: 0.278, fmt: fmt3 },
    { key: 'b1', label: 'Birth hi', min: 0.3, max: 0.5, step: 0.001, value: 0.365, fmt: fmt3 },
  ],

  lenia: [{ key: 'speed', label: 'Speed', min: 1, max: 10, step: 1, value: 6, fmt: fmt0 }],

  rd: [{ key: 'speed', label: 'Speed', min: 1, max: 10, step: 1, value: 5, fmt: fmt0 }],

  nca: [],
};

const MONO = "font-family:'Martian Mono','JetBrains Mono',monospace;";

export class ControlRail {
  private root: HTMLElement;
  private body: HTMLElement;
  private current: FakeName | null = null;
  private values: Record<string, Record<string, number>> = {};
  private inputs: Record<string, { input: HTMLInputElement; val: HTMLElement; fmt: (v: number) => string }> = {};

  private regimeSync: ((idx: number) => void) | null = null;

  constructor(
    private visuals: Record<string, ChapterVisual>,
    private onValues: (visual: string, key: string, value: number) => void,
    initial?: Record<string, Record<string, number>>,
  ) {
    if (initial) this.values = initial;
    this.root = document.createElement('div');
    this.root.setAttribute('data-controls', '');

    this.root.style.cssText =
      'position:fixed;right:80px;bottom:36px;z-index:30;width:min(24vw,300px);opacity:0;pointer-events:none;transition:opacity 0.5s ease;background:rgba(12,13,24,0.78);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid #232741;border-radius:2px;padding:12px 14px;';
    this.root.innerHTML = `<div data-rail-line style="height:1px;background:#232741;margin-bottom:12px;"></div>`;
    this.body = document.createElement('div');
    this.root.appendChild(this.body);
    document.body.appendChild(this.root);
  }

  setChapter(visual: FakeName | null, accent: string | null): void {
    this.current = visual;
    if (!visual) {
      this.root.style.opacity = '0';
      this.root.style.pointerEvents = 'none';
      return;
    }
    const line = this.root.querySelector<HTMLElement>('[data-rail-line]');
    if (line) line.style.background = (accent ?? '#232741') + '55';
    this.body.innerHTML = '';
    this.inputs = {};
    const store = (this.values[visual] ??= {});
    for (const p of PARAMS[visual]) {
      const v = store[p.key] ?? p.value;
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:104px 1fr 50px;gap:8px;align-items:center;margin-bottom:10px;';
      row.innerHTML = `
        <span style="${MONO}font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#545475;white-space:nowrap;">${p.label}</span>
        <input data-control type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}" aria-label="${p.label}" style="accent-color:${accent ?? '#4DE1FF'};">
        <span data-val style="${MONO}font-size:11px;color:#9A9AB8;text-align:right;font-variant-numeric:tabular-nums;">${(p.fmt ?? fmt2)(v)}</span>`;
      const input = row.querySelector('input')!;
      const val = row.querySelector<HTMLElement>('[data-val]')!;
      this.inputs[p.key] = { input, val, fmt: p.fmt ?? fmt2 };

      input.addEventListener('input', () => {
        const value = Number(input.value);
        store[p.key] = value;
        val.textContent = (p.fmt ?? fmt2)(value);

        this.visuals[visual]?.setParam(p.key, value);
        this.onValues(visual, p.key, value);
      });
      this.body.appendChild(row);
    }
    this.regimeSync = null;
    if (visual === 'lenia') this.mountSpeciesRow(accent ?? '#2BFFB0');
    if (visual === 'rd') this.mountRegimeRow(accent ?? '#FFE24D');
    if (visual === 'ltl') this.mountLtlPresetRow(accent ?? '#FF4DA6');
    if (visual === 'nca') this.mountCreatureRow(accent ?? '#EDEBF5');
    this.root.style.opacity = '1';
    this.root.style.pointerEvents = 'auto';
  }

  setValue(visual: FakeName, key: string, value: number): void {
    (this.values[visual] ??= {})[key] = value;
    if (this.current === visual) {
      if (key === 'regime') {
        this.regimeSync?.(Math.round(value));
        return;
      }
      const ref = this.inputs[key];
      if (ref) {
        ref.input.value = String(value);
        ref.val.textContent = ref.fmt(value);
      }
    }
  }

  private mountSpeciesRow(accent: string): void {
    const store = (this.values['lenia'] ??= {});
    const active = Math.round(store['species'] ?? 0);
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;margin-bottom:8px;';
    const coords = document.createElement('div');
    coords.style.cssText = `${MONO}font-size:10px;letter-spacing:0.08em;color:#545475;font-variant-numeric:tabular-nums;margin-bottom:12px;`;

    const showCoords = (i: number) => {
      const sp = SPECIES[i] ?? SPECIES[0]!;
      coords.textContent = `μ ${sp.mu.toFixed(3)} · σ ${sp.sigma.toFixed(4)} · R ${sp.R}`;
    };
    showCoords(active);
    const style = (b: HTMLButtonElement, on: boolean) => {
      b.style.borderColor = on ? accent : '#232741';
      b.style.color = on ? '#EDEBF5' : '#545475';
    };
    SPECIES.forEach((sp, i) => {
      const b = document.createElement('button');
      b.setAttribute('data-control', '');
      b.textContent = sp.label;
      b.title = `${sp.name} — it ${sp.verb}`;
      b.setAttribute('aria-label', `${sp.name} — it ${sp.verb}`);
      b.style.cssText = `flex:1;background:none;border:1px solid #232741;${MONO}font-size:10px;letter-spacing:0.08em;text-transform:uppercase;padding:6px 2px;border-radius:2px;cursor:pointer;`;
      style(b, i === active);
      b.addEventListener('click', () => {
        store['species'] = i;
        this.visuals['lenia']?.setParam('species', i);
        this.onValues('lenia', 'species', i);
        showCoords(i);
        row.querySelectorAll('button').forEach((bb, j) => style(bb as HTMLButtonElement, j === i));
      });
      row.appendChild(b);
    });
    this.body.insertBefore(coords, this.body.firstChild);
    this.body.insertBefore(row, coords);
  }

  private mountLtlPresetRow(accent: string): void {
    const store = (this.values['ltl'] ??= {});
    const active = Math.round(store['preset'] ?? 0);
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:14px;';
    const style = (b: HTMLButtonElement, on: boolean) => {
      b.style.borderColor = on ? accent : '#232741';
      b.style.color = on ? '#EDEBF5' : '#545475';
    };
    LTL_PRESETS.forEach((p, i) => {
      const b = document.createElement('button');
      b.setAttribute('data-control', '');
      b.textContent = p.label;
      b.title = `R ${p.r} · ${p.bodies} bodies`;
      b.setAttribute('aria-label', `${p.label} preset`);
      b.style.cssText = `background:none;border:1px solid #232741;${MONO}font-size:10px;letter-spacing:0.08em;text-transform:uppercase;padding:6px 2px;border-radius:2px;cursor:pointer;`;
      style(b, i === active);
      b.addEventListener('click', () => {
        store['preset'] = i;
        this.visuals['ltl']?.setParam('preset', i);
        this.onValues('ltl', 'preset', i);
        row.querySelectorAll('button').forEach((bb, j) => style(bb as HTMLButtonElement, j === i));
      });
      row.appendChild(b);
    });
    this.body.insertBefore(row, this.body.firstChild);
  }

  private mountCreatureRow(accent: string): void {
    const store = (this.values['nca'] ??= {});
    const active = Math.round(store['creature'] ?? 0);
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:4px;';
    const style = (b: HTMLButtonElement, on: boolean) => {
      b.style.borderColor = on ? accent : '#232741';
      b.style.color = on ? '#EDEBF5' : '#545475';
    };
    const buttons: HTMLButtonElement[] = [];
    NCA_CREATURES.forEach((c, i) => {
      const b = document.createElement('button');
      b.setAttribute('data-control', '');
      b.textContent = c.label;
      b.setAttribute('aria-label', `${c.key} creature`);
      b.style.cssText = `background:none;border:1px solid #232741;${MONO}font-size:10px;letter-spacing:0.08em;text-transform:uppercase;padding:6px 2px;border-radius:2px;cursor:pointer;`;
      style(b, i === active);
      b.addEventListener('click', () => {
        store['creature'] = i;
        this.visuals['nca']?.setParam('creature', i);
        this.onValues('nca', 'creature', i);
        buttons.forEach((bb, j) => style(bb, j === i));
      });
      buttons.push(b);
      row.appendChild(b);
    });
    this.body.insertBefore(row, this.body.firstChild);
  }

  private mountRegimeRow(accent: string): void {
    const store = (this.values['rd'] ??= {});
    const active = Math.round(store['regime'] ?? 0);
    const row = document.createElement('div');
    row.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px;';
    const style = (b: HTMLButtonElement, on: boolean) => {
      b.style.borderColor = on ? accent : '#232741';
      b.style.color = on ? '#EDEBF5' : '#545475';
    };
    const buttons: HTMLButtonElement[] = [];
    RD_REGIMES.forEach((rg, i) => {
      const b = document.createElement('button');
      b.setAttribute('data-control', '');
      b.textContent = rg.label;
      b.title = `F ${rg.F.toFixed(4)} · k ${rg.k.toFixed(4)}`;
      b.setAttribute('aria-label', `${rg.label} regime`);
      b.style.cssText = `background:none;border:1px solid #232741;${MONO}font-size:10px;letter-spacing:0.08em;text-transform:uppercase;padding:6px 2px;border-radius:2px;cursor:pointer;`;
      style(b, i === active);
      b.addEventListener('click', () => {
        store['regime'] = i;
        this.onValues('rd', 'regime', i);
        buttons.forEach((bb, j) => style(bb, j === i));
      });
      buttons.push(b);
      row.appendChild(b);
    });
    this.regimeSync = (idx) => {
      store['regime'] = idx;
      buttons.forEach((bb, j) => style(bb, j === idx));
    };
    this.body.insertBefore(row, this.body.firstChild);
  }
}
