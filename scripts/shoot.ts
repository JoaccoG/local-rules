

import { chromium, type Browser, type Page } from 'playwright';
import path from 'node:path';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const VIEWPORT = { width: 1440, height: 900 };
export const DEVICE_SCALE = 2;
export const SETTLE_MS = 3000;

const VENDOR_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'vendor');

function vendorContentType(url: string): string {
  if (url.includes('/css2')) return 'text/css; charset=utf-8';
  if (url.endsWith('.woff2')) return 'font/woff2';
  return 'text/javascript; charset=utf-8';
}

async function routeVendored(page: Page): Promise<void> {
  let index: Record<string, string> = {};
  try {
    index = JSON.parse(await readFile(path.join(VENDOR_DIR, 'index.json'), 'utf8'));
  } catch {
    console.error('[shoot] scripts/vendor/index.json missing — run: tsx scripts/vendor-cdn.ts');
  }
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    const u = new URL(url);
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.protocol === 'data:') {
      return route.continue();
    }
    const name = index[url];
    if (name) {
      return route.fulfill({
        body: await readFile(path.join(VENDOR_DIR, name)),
        contentType: vendorContentType(url),
      });
    }
    console.error(`[shoot] aborting unvendored external request: ${url}`);
    return route.abort();
  });
}

export async function openPage(browser: Browser, url: string): Promise<Page> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE,
  });
  const page = await context.newPage();
  await routeVendored(page);
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      console.error(`[page ${msg.type()}] ${msg.text()}`);
    }
  });
  page.on('pageerror', (err) => console.error(`[page error] ${err.message}`));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return page;
}

export async function waitForPreloader(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () => {
        const pre = document.querySelector('[data-preloader]');
        return !pre || getComputedStyle(pre).display === 'none';
      },
      { timeout: 15_000 },
    )
    .catch(() => console.error('[shoot] preloader never finished — shooting anyway'));
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});
}

export async function scrollTo(page: Page, target: number | string): Promise<number> {
  return page.evaluate((t) => {
    let y: number;
    if (typeof t === 'number') {
      y = t;
    } else if (/^\d+(\.\d+)?%$/.test(t)) {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      y = (parseFloat(t) / 100) * max;
    } else {
      const el = document.querySelector(t);
      if (!el) throw new Error(`selector not found: ${t}`);
      y = el.getBoundingClientRect().top + window.scrollY;
    }
    const w = window as any;
    const lenis = w.__LR?.lenis ?? w.__DC_INSTANCE?.lenis;
    if (lenis) lenis.scrollTo(y, { immediate: true, force: true });
    else window.scrollTo(0, y);
    return y;
  }, target);
}

export async function settle(page: Page, ms: number = SETTLE_MS): Promise<void> {
  await page.waitForTimeout(ms);
}

export async function shoot(
  page: Page,
  outBase: string,
  opts: { fullPage?: boolean } = {},
): Promise<void> {
  await mkdir(path.dirname(path.resolve(outBase)), { recursive: true });
  await page.screenshot({ path: `${outBase}.viewport.png` });
  if (opts.fullPage !== false) {
    await page.screenshot({ path: `${outBase}.full.png`, fullPage: true });
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const [url, rawScroll, outBase] = process.argv.slice(2);
  if (!url || rawScroll === undefined || !outBase) {
    console.error('usage: tsx scripts/shoot.ts <url> <scroll px|%|selector> <out-base>');
    process.exit(1);
  }
  const target = /^\d+(\.\d+)?$/.test(rawScroll) ? Number(rawScroll) : rawScroll;
  const browser = await chromium.launch();
  try {
    const page = await openPage(browser, url);
    await waitForPreloader(page);
    const y = await scrollTo(page, target);
    await settle(page);
    await shoot(page, outBase);
    console.log(`shot ${url} @ y=${Math.round(y)} → ${outBase}.{viewport,full}.png`);
  } finally {
    await browser.close();
  }
}
