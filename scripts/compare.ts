

import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [refPath, candPath, outPath] = process.argv.slice(2);
if (!refPath || !candPath || !outPath) {
  console.error('usage: tsx scripts/compare.ts <reference.png> <candidate.png> <out.png>');
  process.exit(1);
}

const a = PNG.sync.read(readFileSync(refPath));
const b = PNG.sync.read(readFileSync(candPath));
if (a.width !== b.width || a.height !== b.height) {
  console.error(`size mismatch: ${a.width}×${a.height} vs ${b.width}×${b.height}`);
  process.exit(2);
}
const { width, height } = a;
const diff = new PNG({ width, height });
const bad = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: 0.18 });

const out = new PNG({ width: width * 3 + 8, height, fill: true });
PNG.bitblt(a, out, 0, 0, width, height, 0, 0);
PNG.bitblt(b, out, 0, 0, width, height, width + 4, 0);
PNG.bitblt(diff, out, 0, 0, width, height, width * 2 + 8, 0);
writeFileSync(outPath, PNG.sync.write(out));
console.log(`${((bad / (width * height)) * 100).toFixed(2)}% pixels differ → ${outPath}`);
