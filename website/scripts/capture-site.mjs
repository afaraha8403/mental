#!/usr/bin/env node
import {mkdirSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'screenshots-of-site');
const origin = process.env.SITE_ORIGIN || 'http://127.0.0.1:4321';

mkdirSync(outDir, {recursive: true});

const browser = await chromium.launch();
const page = await browser.newPage({
  deviceScaleFactor: 2,
  colorScheme: 'dark',
});
await page.addInitScript(() => {
  localStorage.setItem('mental-theme', 'dark');
});

async function waitForImages() {
  await page.waitForSelector('h1');
  await page.evaluate(async () => {
    const imgs = [...document.images];
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? null
          : new Promise((resolve) => {
              img.addEventListener('load', resolve, {once: true});
              img.addEventListener('error', resolve, {once: true});
            }),
      ),
    );
  });
}

async function resetScroll() {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;
    for (const node of document.querySelectorAll('*')) {
      if (node.scrollLeft) node.scrollLeft = 0;
    }
  });
}

/** Vertical-only scroll so wide screenshots cannot shift the viewport sideways. */
async function scrollToId(id) {
  await resetScroll();
  await page.evaluate((sectionId) => {
    const el = document.getElementById(sectionId);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo(0, Math.max(0, y));
  }, id);
}

async function shot(name, size) {
  await page.setViewportSize(size);
  await page.goto(origin, {waitUntil: 'networkidle'});
  await waitForImages();
  await resetScroll();
  await page.screenshot({
    path: join(outDir, `${name}.png`),
    fullPage: true,
  });
  await page.screenshot({
    path: join(outDir, `${name}.webp`),
    type: 'webp',
    quality: 80,
    fullPage: true,
  });
}

await shot('desktop', {width: 1440, height: 900});
await shot('mobile', {width: 390, height: 844});

await page.setViewportSize({width: 1440, height: 900});
await page.goto(origin, {waitUntil: 'networkidle'});
await waitForImages();
await resetScroll();
await page.screenshot({
  path: join(outDir, 'desktop-hero.png'),
  fullPage: false,
});
await scrollToId('product');
await page.screenshot({
  path: join(outDir, 'desktop-product.png'),
  fullPage: false,
});
await scrollToId('privacy');
await page.screenshot({
  path: join(outDir, 'desktop-privacy.png'),
  fullPage: false,
});

await page.setViewportSize({width: 390, height: 844});
await page.goto(origin, {waitUntil: 'networkidle'});
await waitForImages();
await resetScroll();
await page.screenshot({
  path: join(outDir, 'mobile-hero.png'),
  fullPage: false,
});

await browser.close();
console.log('Wrote site previews to', outDir);
