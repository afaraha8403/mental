#!/usr/bin/env node
/**
 * Prove the docs section against a running preview: hub, the three new pages, and home links.
 */
import {chromium} from 'playwright';

const origin = process.env.SITE_ORIGIN || 'http://127.0.0.1:4321';

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const failures = [];

function fail(message) {
  failures.push(message);
}

try {
  await page.goto(origin, {waitUntil: 'networkidle'});
  const docsLinks = page.getByRole('link', {name: 'Docs', exact: true});
  const docsCount = await docsLinks.count();
  if (docsCount < 1) fail('homepage has no Docs link');
  for (let i = 0; i < docsCount; i++) {
    const href = await docsLinks.nth(i).getAttribute('href');
    if (href !== '/docs') fail(`Docs href was ${JSON.stringify(href)}`);
  }

  await docsLinks.first().click();
  await page.waitForURL((url) => url.pathname === '/docs' || url.pathname === '/docs/');
  const hub = await page.locator('h1').first().innerText();
  if (!hub.includes('Mental CLI docs')) fail(`hub h1 was ${JSON.stringify(hub)}`);
  const groups = await page.locator('.docs-nav-group .docs-nav-heading').allTextContents();
  if (groups.join(',') !== 'Start,Surfaces,Reference,Background') {
    fail(`doc groups were ${groups.join(',')}`);
  }
  const hubHtml = await page.locator('article').innerHTML();

  const pages = [
    ['Dashboard', '/docs/dashboard', '127.0.0.1:3847'],
    ['Host UIs', '/docs/hosts', '/mental'],
    ['Decision models', '/docs/decide', 'mental option decide'],
  ];
  for (const [label, path, needle] of pages) {
    if (!hubHtml.includes(`href="${path}"`)) fail(`hub article missing ${path}`);
    await page.locator('.docs-nav').getByRole('link', {name: label, exact: true}).click();
    await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === path);
    const body = await page.locator('article').innerText();
    if (!body.includes(needle)) fail(`${path} missing ${JSON.stringify(needle)}`);
    const attention = await page.getByRole('link', {name: 'Attention', exact: true}).getAttribute('href');
    if (attention !== '/#attention') fail(`${path} Attention href was ${JSON.stringify(attention)}`);
    if (path === '/docs/dashboard') {
      const views = page.locator('a.docs-toc-link[href="#views"]');
      if ((await views.count()) !== 1) fail('dashboard outline missing Views');
      await views.click();
      await page.waitForFunction(() => location.hash === '#views');
      const next = await page.locator('.docs-pager-next a').getAttribute('href');
      if (next !== '/docs/hosts') fail(`dashboard next was ${JSON.stringify(next)}`);
      const prev = await page.locator('.docs-pager a').first().getAttribute('href');
      if (prev !== '/docs/install') fail(`dashboard previous was ${JSON.stringify(prev)}`);
      const edit = await page.getByRole('link', {name: 'Edit on GitHub'}).getAttribute('href');
      if (edit !== 'https://github.com/afaraha8403/mental/blob/main/docs/dashboard.md') {
        fail(`edit link was ${JSON.stringify(edit)}`);
      }
      const current = await page.locator('.docs-nav-current').innerText();
      if (!current.includes('Dashboard')) fail(`current nav was ${JSON.stringify(current)}`);
    }
  }

  await page.setViewportSize({width: 390, height: 844});
  await page.goto(`${origin}/docs/cli`, {waitUntil: 'networkidle'});
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  if (overflow > 1) fail(`mobile /docs/cli overflows by ${overflow}px`);
  if (await page.locator('.docs-toc').isVisible()) fail('outline is visible on a phone');
  if (await page.locator('.docs-nav-group > .docs-nav-heading').first().isVisible()) {
    fail('sidebar group headings are visible on a phone');
  }
  const cli = await page.locator('article').innerText();
  if (!cli.includes('--tag')) fail('CLI page missing --tag');
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Docs check passed');
