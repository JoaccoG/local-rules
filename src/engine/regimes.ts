

export const RD_REGIMES: readonly { key: string; label: string; F: number; k: number }[] = [
  { key: 'mitosis', label: 'MITOSIS', F: 0.0367, k: 0.0649 },
  { key: 'coral', label: 'CORAL', F: 0.0545, k: 0.062 },
  { key: 'worms', label: 'WORMS', F: 0.046, k: 0.063 },
  { key: 'mazes', label: 'MAZES', F: 0.029, k: 0.057 },
  { key: 'spirals', label: 'SPIRALS', F: 0.018, k: 0.051 },
];

export const LTL_PRESETS: readonly { key: string; label: string; r: number; bodies: number }[] = [
  { key: 'bosco', label: 'BOSCO', r: 5, bodies: 12 },
  { key: 'grain', label: 'GRAIN', r: 1, bodies: 7 },
  { key: 'tangle', label: 'TANGLE', r: 2, bodies: 7 },
  { key: 'colony', label: 'COLONY', r: 4, bodies: 7 },
];

export const NCA_CREATURES: readonly { key: string; label: string }[] = [
  { key: 'butterfly', label: '🦋 BUTTERFLY' },
  { key: 'heart', label: '❤️ HEART' },
  { key: 'lizard', label: '🦎 LIZARD' },
  { key: 'mushroom', label: '🍄 MUSHROOM' },
  { key: 'star', label: '⭐ STAR' },
  { key: 'alien', label: '👽 ALIEN' },
  { key: 'ghost', label: '👻 GHOST' },
  { key: 'flower', label: '🌼 FLOWER' },
];
