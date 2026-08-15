

import { chromium } from 'playwright';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { openPage, waitForPreloader, scrollTo, settle, shoot, VIEWPORT } from './shoot.ts';

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) {
  console.error('usage: tsx scripts/shoot-all.ts <url> <out-dir>');
  process.exit(1);
}

interface Zone {
  label: string;
  top: number;
  height: number;
}

const browser = await chromium.launch();
try {
  await mkdir(outDir, { recursive: true });
  const page = await openPage(browser, url);

  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, '00-preloader.png') });

  await waitForPreloader(page);
  await settle(page);

  const zones: Zone[] = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-zone]')).map((el, i) => {
      const r = el.getBoundingClientRect();
      return {
        label: el.getAttribute('data-screen-label') ?? `${i}-${el.getAttribute('data-zone')}`,
        top: r.top + window.scrollY,
        height: r.height,
      };
    }),
  );

  const vh = VIEWPORT.height;
  for (const zone of zones) {
    const slug = zone.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const scrollRange = Math.max(0, zone.height - vh);
    if (zone.height <= 2.2 * vh) {

      const y = zone.top + scrollRange * 0.5;
      await scrollTo(page, y);
      await settle(page);
      await shoot(page, path.join(outDir, slug), { fullPage: false });
      console.log(`${slug}  y=${Math.round(y)}`);
    } else {

      const n = Math.max(Math.ceil(zone.height / vh), 6);
      for (let k = 0; k < n; k++) {
        const p = (k + 0.5) / n;
        const y = zone.top + scrollRange * p;
        await scrollTo(page, y);
        await settle(page);
        const name = `${slug}-p${String(Math.round(p * 100)).padStart(2, '0')}`;
        await shoot(page, path.join(outDir, name), { fullPage: false });
        console.log(`${name}  y=${Math.round(y)}`);
      }
    }
  }

  await scrollTo(page, 0);
  await settle(page);
  await page.screenshot({ path: path.join(outDir, 'fullpage.png'), fullPage: true });
  console.log(`done → ${outDir}`);
} finally {
  await browser.close();
}
