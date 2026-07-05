

import type { FakeName } from '../visuals/fakes';

export interface ChapterDef {
  n: number;
  visual: FakeName;
  label: string;
  accent: string;
  bloomm: string;
  hudnum: string;
  hudname: string;
  hudmeta: string;
  glow: string;
  ghostOpacity: string;
  title: string;
  lede: string;
  body1: string;
  body2: string;
  chip: string;
  chipMarginTop: number;
  pullQuote?: string;
  fkCard?: boolean;
}

export const CHAPTERS: ChapterDef[] = [
  {
    n: 1,
    visual: 'conway',
    label: '04 Conway',
    accent: '#4DE1FF',
    bloomm: '0.5',
    hudnum: '01',
    hudname: 'Conway',
    hudmeta: '3×3 · 1 bit',
    glow: 'rgba(77,225,255,0.06)',
    ghostOpacity: '0.3',
    title: 'Conway',
    lede: 'Eighteen bits decide whether a cell lives or dies. Every pattern anyone has ever found in this universe comes out of those eighteen bits.',
    body1:
      'The rule fits in a sentence: a live cell with two or three live neighbours survives, a dead cell with exactly three becomes alive, everything else dies. Written out, it is a lookup table with eighteen entries — one bit of state, one integer census.',
    body2:
      'It is Turing-complete. People have built clocks, adders and self-replicating machines inside it. But even its famous glider only hops across the grid one cell at a time — nothing here moves smoothly, because the universe underneath has the resolution of a chessboard.',
    chip: 'B3/S23 · MOORE 3×3',
    chipMarginTop: 30,
  },
  {
    n: 2,
    visual: 'rulespace',
    label: '05 Rule space',
    accent: '#8B5CF6',
    bloomm: '0.85',
    hudnum: '02',
    hudname: 'Rule space',
    hudmeta: '2^18 tables',
    glow: 'rgba(139,92,246,0.07)',
    ghostOpacity: '0.32',
    title: 'Rule space',
    lede: 'If the table is editable, there are 262,144 universes. Almost all of them are noise. A handful are worlds.',
    body1:
      'Keep the 3×3 neighbourhood and make the table editable. Eighteen free bits give 262,144 possible universes — few enough to enumerate on a laptop before lunch.',
    body2:
      'Almost all of them are static, saturated, or television snow. The interesting rules cluster on thin seams between those phases: balanced at the edge of order, where structure persists without freezing solid.',
    chip: '2¹⁸ = 262,144 TABLES',
    chipMarginTop: 30,
  },
  {
    n: 3,
    visual: 'ltl',
    label: '06 Larger than Life',
    accent: '#FF3D8B',
    bloomm: '1',
    hudnum: '03',
    hudname: 'Larger than Life',
    hudmeta: 'R=5 · 1 bit',
    glow: 'rgba(255,61,139,0.06)',
    ghostOpacity: '0.3',
    title: 'Larger than Life',
    lede: 'Widen the neighbourhood and the pixels stop mattering. Shapes start to move like they mean it.',
    body1:
      'Larger than Life widens the census from radius 1 to radius 5 and beyond. A cell no longer asks eight neighbours what to do; it polls a hundred and twenty.',
    body2:
      'At that radius the lattice stops mattering to the behaviour. Coherent blobs form, travel and collide — shapes larger than the pixels they are made of, obeying statistics rather than adjacency.',
    chip: 'R=5 · B 34–45 · S 34–58',
    chipMarginTop: 30,
  },
  {
    n: 4,
    visual: 'lenia',
    label: '07 Lenia',
    accent: '#2BFFB0',
    bloomm: '1.5',
    hudnum: '04',
    hudname: 'Lenia',
    hudmeta: 'continuous · R=13',
    glow: 'rgba(43,255,176,0.07)',
    ghostOpacity: '0.3',
    title: 'Lenia',
    lede: 'Continuous in state, in space, and in time. What emerges swims, rotates, pulses, and dies — from one bell curve and one ring.',
    body1:
      'Lenia takes the limit in every direction at once. State, space and time go continuous; the neighbourhood becomes a smooth ring kernel, the rule a bell curve over its weighted average.',
    body2:
      'What comes out is a bestiary — hundreds of catalogued species that swim, rotate, pulse and die. All of it falls out of one kernel and one curve; none of it was put there.',
    chip: 'μ=0.15 · σ=0.015 · R=13',
    chipMarginTop: 30,
    pullQuote:
      'It behaves so much like biology that the vocabulary slips — you stop saying patterns and start saying creatures.',
  },
  {
    n: 5,
    visual: 'rd',
    label: '08 Reaction-diffusion',
    accent: '#FFE24D',
    bloomm: '0.9',
    hudnum: '05',
    hudname: 'Reaction-diffusion',
    hudmeta: 'Gray–Scott F·k',
    glow: 'rgba(255,226,77,0.06)',
    ghostOpacity: '0.28',
    title: 'Reaction-diffusion',
    lede: 'Two chemicals, one eating the other. This is where the leopard gets its spots.',
    body1:
      'Turing wrote it down in 1952: two chemicals, one activating and one inhibiting, diffusing at different speeds. Underneath, it is still each point consulting its neighbourhood at every step.',
    body2:
      'Move the feed and kill rates by a few thousandths and the field sweeps through spots, stripes, labyrinths and coral. The same mechanism, tuned to different coordinates, is printed on leopards, zebrafish and fingertips.',
    chip: 'F=0.0367 · k=0.0649',
    chipMarginTop: 26,
    fkCard: true,
  },
];

const fkCardHTML = `
<div data-reveal data-fk-card style="margin-top:34px;border:1px solid #232741;padding:18px;max-width:300px;width:100%;">
  <div style="display:flex;justify-content:space-between;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#545475;margin-bottom:12px;"><span>Parameter map</span><span>F / k</span></div>
  <div style="position:relative;height:180px;border:1px solid #232741;background-image:radial-gradient(closest-side at 87% 59%,rgba(255,226,77,0.16),transparent 70%),radial-gradient(closest-side at 30% 72%,rgba(255,226,77,0.07),transparent 60%);">
    <div style="position:absolute;left:0;right:0;top:59.2%;height:1px;background:#3A4068;opacity:0.7;"></div>
    <div style="position:absolute;top:0;bottom:0;left:87.25%;width:1px;background:#3A4068;opacity:0.7;"></div>
    <div style="position:absolute;left:87.25%;top:59.2%;width:5px;height:5px;margin:-2px 0 0 -2px;background:#FFE24D;box-shadow:0 0 8px 1px rgba(255,226,77,0.8);"></div>
  </div>
  <div style="display:flex;justify-content:space-between;margin-top:10px;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:13px;color:#9A9AB8;font-variant-numeric:tabular-nums;"><span>F 0.0367</span><span>k 0.0649</span></div>
</div>`;

export function chapterHTML(c: ChapterDef): string {
  return `
<section data-zone="ch" data-chapter="${c.n}" data-visual="${c.visual}" data-accent="${c.accent}" data-bloomm="${c.bloomm}" data-hudnum="${c.hudnum}" data-hudname="${c.hudname}" data-hudmeta="${c.hudmeta}" data-screen-label="${c.label}" style="position:relative;padding:24vh 80px 28vh;">
  <div style="position:absolute;right:5%;top:16%;width:620px;height:620px;background:radial-gradient(circle,${c.glow},transparent 65%);pointer-events:none;"></div>
  <div data-chgrid style="position:relative;max-width:1440px;margin:0 auto;display:grid;grid-template-columns:repeat(12,1fr);column-gap:24px;">
    <div style="grid-column:8 / span 5;display:flex;flex-direction:column;align-items:flex-start;">
      <div data-reveal style="font-family:'Martian Mono','JetBrains Mono',monospace;font-size:clamp(56px,5vw,72px);color:${c.accent};opacity:${c.ghostOpacity};line-height:1;font-variant-numeric:tabular-nums;">${c.hudnum}</div>
      <div data-reveal style="width:56px;height:1px;background:#3A4068;margin:22px 0 30px;"></div>
      <h2 data-reveal style="margin:0 0 20px;font-family:'Anybody','Archivo',sans-serif;font-variation-settings:'wdth' 100;font-weight:700;font-size:40px;letter-spacing:-0.02em;line-height:1;color:#EDEBF5;text-transform:uppercase;">${c.title}</h2>
      <p data-reveal style="margin:0 0 30px;font-family:'Newsreader','Literata',serif;font-size:23px;line-height:1.5;color:#EDEBF5;max-width:42ch;text-wrap:pretty;">${c.lede}</p>
      <p data-reveal style="margin:0 0 22px;font-family:'Newsreader','Literata',serif;font-optical-sizing:auto;font-size:19px;line-height:1.65;color:#9A9AB8;max-width:52ch;text-wrap:pretty;">${c.body1}</p>
      ${
        c.pullQuote
          ? `<p data-reveal style="margin:26px 0;font-family:'Newsreader','Literata',serif;font-style:italic;font-size:28px;line-height:1.4;color:#EDEBF5;max-width:38ch;text-wrap:pretty;">${c.pullQuote}</p>`
          : ''
      }
      <p data-reveal style="margin:0;font-family:'Newsreader','Literata',serif;font-optical-sizing:auto;font-size:19px;line-height:1.65;color:#9A9AB8;max-width:52ch;text-wrap:pretty;">${c.body2}</p>
      ${c.fkCard ? fkCardHTML : ''}
      <div data-reveal style="margin-top:${c.chipMarginTop}px;border:1px solid #232741;border-radius:2px;padding:10px 16px;font-family:'Martian Mono','JetBrains Mono',monospace;font-size:13px;letter-spacing:0.08em;color:#9A9AB8;font-variant-numeric:tabular-nums;">${c.chip}</div>
    </div>
  </div>
</section>`;
}
