

import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'vendor');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';

const SCRIPTS = [
  'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js',
  'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js',
  'https://unpkg.com/lenis@1.1.14/dist/lenis.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
];

const FONTS_CSS =
  'https://fonts.googleapis.com/css2?family=Anybody:wdth,wght@50..150,100..900&family=Martian+Mono:wght@100..800&family=Newsreader:ital,opsz,wght@0,6..72,200..800;1,6..72,200..800&display=swap';

function localName(url: string): string {
  const u = new URL(url);
  const base = u.pathname.replace(/^\//, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 8);
  return `${u.hostname.replace(/\./g, '_')}--${base}-${hash}`;
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

await mkdir(outDir, { recursive: true });
const index: Record<string, string> = {};

for (const url of SCRIPTS) {
  const name = localName(url);
  await writeFile(path.join(outDir, name), await fetchBytes(url));
  index[url] = name;
  console.log(`✓ ${url}`);
}

const cssBytes = await fetchBytes(FONTS_CSS);
const cssName = 'fonts_googleapis_com--css2.css';
await writeFile(path.join(outDir, cssName), cssBytes);
index[FONTS_CSS] = cssName;
console.log(`✓ ${FONTS_CSS}`);

const css = cssBytes.toString('utf8');
const fontUrls = [...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map((m) => m[1]))];
for (const url of fontUrls) {
  const name = localName(url);
  await writeFile(path.join(outDir, name), await fetchBytes(url));
  index[url] = name;
  console.log(`✓ ${url}`);
}

await writeFile(path.join(outDir, 'index.json'), JSON.stringify(index, null, 2));
console.log(`\n${Object.keys(index).length} files → ${path.relative(process.cwd(), outDir)}/index.json`);
