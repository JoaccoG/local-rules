

export interface Rule {

  birth: number;

  survive: number;
}

export const LIFE: Rule = { birth: 0b000001000, survive: 0b000001100 };

export function parseRule(input: string): Rule | null {
  const parts = input.trim().split('/');
  if (parts.length !== 2) return null;
  let birth: number | null = null;
  let survive: number | null = null;
  for (const raw of parts) {
    const p = raw.trim();
    const m = /^([bs])([0-8]*)$/i.exec(p);
    if (!m) return null;
    let mask = 0;
    for (const d of m[2]!) mask |= 1 << Number(d);
    if (m[1]!.toLowerCase() === 'b') {
      if (birth !== null) return null;
      birth = mask;
    } else {
      if (survive !== null) return null;
      survive = mask;
    }
  }
  if (birth === null || survive === null) return null;
  return { birth, survive };
}

export function formatRule(r: Rule): string {
  const digits = (mask: number) =>
    Array.from({ length: 9 }, (_, k) => k)
      .filter((k) => mask & (1 << k))
      .join('');
  return `B${digits(r.birth)}/S${digits(r.survive)}`;
}

export const NAMED_RULES: ReadonlyArray<{ name: string; rule: string }> = [
  { name: 'Life', rule: 'B3/S23' },
  { name: 'HighLife', rule: 'B36/S23' },
  { name: 'Replicator', rule: 'B1357/S1357' },
  { name: 'Day & Night', rule: 'B3678/S34678' },
  { name: 'Vote', rule: 'B5678/S45678' },
  { name: 'Seeds', rule: 'B2/S' },
  { name: '34 Life', rule: 'B34/S34' },
  { name: 'Morley', rule: 'B368/S245' },
  { name: '2×2', rule: 'B36/S125' },
  { name: 'Life without death', rule: 'B3/S012345678' },
  { name: 'Maze', rule: 'B3/S12345' },
  { name: 'Mazectric', rule: 'B3/S1234' },
  { name: 'Coral', rule: 'B3/S45678' },
  { name: 'Amoeba', rule: 'B357/S1358' },
  { name: 'Diamoeba', rule: 'B35678/S5678' },
  { name: 'Coagulations', rule: 'B378/S235678' },
  { name: 'Stains', rule: 'B3678/S235678' },
  { name: 'DryLife', rule: 'B37/S23' },
  { name: 'Pedestrian Life', rule: 'B38/S23' },
  { name: 'Fredkin', rule: 'B1357/S02468' },
  { name: 'Live Free or Die', rule: 'B2/S0' },
  { name: 'Gnarl', rule: 'B1/S1' },
  { name: 'Star Trek', rule: 'B3/S0248' },
  { name: 'Holstein', rule: 'B35678/S4678' },
];

const named = new Map(NAMED_RULES.map((n) => [n.rule, n.name]));

export function ruleName(r: Rule): string | null {
  return named.get(formatRule(r)) ?? null;
}

function pcg(v: number): number {
  const state = (Math.imul(v, 747796405) + 2891336453) >>> 0;
  const word = Math.imul((state >>> (((state >>> 28) + 4) & 31)) ^ state, 277803737) >>> 0;
  return ((word >>> 22) ^ word) >>> 0;
}
function hash01(seed: number, k: number): number {
  return pcg(pcg(seed >>> 0) ^ (k >>> 0)) / 4294967296;
}

export function randU32CPU(cell: number, step: number, seed: number): number {
  return pcg(pcg(pcg(seed >>> 0) ^ (cell >>> 0)) ^ (step >>> 0));
}

export function hashPairCPU(seed: number, k: number): number {
  return pcg(pcg(seed >>> 0) ^ (k >>> 0));
}
function hashU(seed: number, k: number): number {
  return pcg(pcg(pcg(seed >>> 0) ^ 0x9e3779b9) ^ (k >>> 0)) >>> 0;
}

export function explorerRules(seed: number, worlds: number): Rule[] {
  let lifeTile = 0;
  for (let t = 1; t < 64; t++) if (hash01(seed, t) < hash01(seed, lifeTile)) lifeTile = t;
  const out: Rule[] = [];
  for (let t = 0; t < 64; t++) {
    if (hash01(seed, t) < worlds) {
      const pick = t === lifeTile ? 0 : hashU(seed, t) % NAMED_RULES.length;
      out.push(parseRule(NAMED_RULES[pick]!.rule)!);
    } else {
      const bits = hashU(seed, t + 64) & 0x3ffff;
      out.push({ birth: bits & 0x1ff, survive: (bits >> 9) & 0x1ff });
    }
  }
  return out;
}
