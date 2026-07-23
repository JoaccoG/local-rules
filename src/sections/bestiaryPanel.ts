

import { NCA_CREATURES } from '../engine/regimes';

export interface CreatureStat {
  key: string;
  steps: number;
  healPct: number;
  abuseMed: number;
  abuseFloor: number;
}

export const NCA_STATS: Record<string, CreatureStat> = {
  butterfly: { key: 'butterfly', steps: 3500, healPct: 99.6, abuseMed: 95.1, abuseFloor: 78 },
  heart: { key: 'heart', steps: 3500, healPct: 94.3, abuseMed: 78.2, abuseFloor: 56 },
  lizard: { key: 'lizard', steps: 4000, healPct: 99.6, abuseMed: 89.4, abuseFloor: 51 },
  mushroom: { key: 'mushroom', steps: 5000, healPct: 99.9, abuseMed: 95.2, abuseFloor: 64 },
  star: { key: 'star', steps: 3500, healPct: 98.4, abuseMed: 94.8, abuseFloor: 16 },
  alien: { key: 'alien', steps: 3500, healPct: 99.8, abuseMed: 98.4, abuseFloor: 94 },
  ghost: { key: 'ghost', steps: 3500, healPct: 98.0, abuseMed: 88.1, abuseFloor: 71 },
  flower: { key: 'flower', steps: 5000, healPct: 99.6, abuseMed: 87.7, abuseFloor: 40 },
};

const MONO = "font-family:'Martian Mono','JetBrains Mono',monospace;";

const statBar = (label: string, pct: number, floor?: number): string => `
<div style="margin-bottom:14px;">
  <div style="display:flex;justify-content:space-between;align-items:baseline;${MONO}font-size:12px;letter-spacing:0.04em;margin-bottom:7px;">
    <span style="color:#9A9AB8;text-transform:uppercase;letter-spacing:0.14em;font-size:10px;">${label}</span>
    <span style="color:#EDEBF5;font-variant-numeric:tabular-nums;">${pct.toFixed(1)}%${
      floor !== undefined
        ? ` <span style="color:#545475;">· worst ${floor.toFixed(0)}%</span>`
        : ''
    }</span>
  </div>
  <div style="position:relative;height:3px;background:#232741;border-radius:2px;">
    ${
      floor !== undefined
        ? `<div style="position:absolute;left:0;top:0;height:3px;width:${floor}%;background:#3A4068;border-radius:2px;"></div>`
        : ''
    }
    <div data-stat-fill style="position:absolute;left:0;top:0;height:3px;width:0%;background:#EDEBF5;border-radius:2px;transition:width 0.7s cubic-bezier(0.16,1,0.3,1);"></div>
  </div>
</div>`;

function readoutHTML(key: string): string {
  const s = NCA_STATS[key]!;
  const c = NCA_CREATURES.find((x) => x.key === key)!;
  return `
  <div style="display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:20px;">
    <span style="${MONO}font-size:15px;letter-spacing:0.08em;color:#EDEBF5;text-transform:uppercase;">${c.label}</span>
    <span style="${MONO}font-size:12px;color:#545475;font-variant-numeric:tabular-nums;">${s.steps.toLocaleString('en-US')} steps</span>
  </div>
  ${statBar('Regrows a scripted cut', s.healPct)}
  ${statBar('Survives slow drag-cuts', s.abuseMed, s.abuseFloor)}`;
}

export function mountBestiaryPanel(): void {
  const chipWrap = document.querySelector<HTMLElement>('[data-bestiary-chips]');
  const readout = document.querySelector<HTMLElement>('[data-bestiary-readout]');
  if (!chipWrap || !readout) return;

  let active = 'butterfly';
  const chips = new Map<string, HTMLButtonElement>();

  const paint = () => {
    for (const [k, btn] of chips) {
      const on = k === active;
      btn.style.borderColor = on ? '#EDEBF5' : '#232741';
      btn.style.color = on ? '#EDEBF5' : '#9A9AB8';
      btn.setAttribute('aria-pressed', String(on));
    }
    readout.innerHTML = readoutHTML(active);

    requestAnimationFrame(() => {
      readout.querySelectorAll<HTMLElement>('[data-stat-fill]').forEach((el, i) => {
        const pct = i === 0 ? NCA_STATS[active]!.healPct : NCA_STATS[active]!.abuseMed;
        el.style.width = `${pct}%`;
      });
    });
  };

  for (const c of NCA_CREATURES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = c.label.split(' ')[0]!;
    btn.title = c.key;
    btn.setAttribute('aria-label', `${c.key} statistics`);
    btn.style.cssText = `${MONO}font-size:18px;line-height:1;padding:10px 0;background:transparent;border:1px solid #232741;border-radius:2px;color:#9A9AB8;cursor:pointer;transition:border-color 0.2s ease,color 0.2s ease;`;
    btn.addEventListener('click', () => {
      active = c.key;
      paint();
    });
    chips.set(c.key, btn);
    chipWrap.appendChild(btn);
  }
  paint();
}
