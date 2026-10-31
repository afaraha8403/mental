#!/usr/bin/env node
/**
 * Prove the homepage order and the sample dashboard against a running preview.
 */
import {chromium} from 'playwright';

const origin = process.env.SITE_ORIGIN || 'http://127.0.0.1:4321';
const RESUME = 'Ship the pointer, not the dump';

const browser = await chromium.launch();
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const failures = [];

function fail(message) {
  failures.push(message);
}

try {
  await page.goto(origin, {waitUntil: 'networkidle'});
  const order = await page.evaluate(() => {
    const y = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      return el.getBoundingClientRect().top + window.scrollY;
    };
    return {
      h1: document.querySelector('#top h1')?.textContent?.trim() ?? '',
      installCount: document.querySelectorAll('#install').length,
      install: y('#install'),
      iframe: y('#top iframe'),
      attention: y('#attention'),
      claude: y('#claude'),
      installText: document.querySelector('#install')?.textContent ?? '',
    };
  });

  if (order.h1 !== 'Picking up where your AI agents left off') {
    fail(`h1 was ${JSON.stringify(order.h1)}`);
  }
  if (order.installCount !== 1) fail(`expected one #install, found ${order.installCount}`);
  if (order.install == null || order.iframe == null || order.install > order.iframe + 8) {
    fail('#install starts below the demo iframe');
  }
  if (order.iframe == null || order.attention == null || order.iframe >= order.attention) {
    fail('demo iframe is not above #attention');
  }
  if (order.claude == null) fail('#claude is missing');
  for (const command of ['npm i -g @balacode/mental', 'mental install', 'mental doctor']) {
    if (!order.installText.includes(command)) fail(`#install missing ${command}`);
  }

  const iframe = page.locator('#top iframe');
  const frame = page.frames().find((entry) => {
    return /\/demo\/index\.html/.test(entry.url()) && !entry.url().includes('embed');
  });
  if (!frame) fail('demo iframe document did not load');
  else {
    await frame.locator('.hero-resume').waitFor({timeout: 15000});
    const resume = await frame.locator('.hero-resume').innerText();
    if (!resume.includes(RESUME)) fail(`resume was ${JSON.stringify(resume)}`);
    const banner = frame.locator('#net-banner');
    if (await banner.isVisible()) fail('offline banner is visible');
    const body = await frame.locator('body').innerText();
    if (body.includes("Can't reach the dashboard server")) fail('offline copy is in the demo');

    const views = [
      ['attention', 'Resolver tests not reviewed'],
      ['library', 'Identity is a UUID in bindings.json'],
      ['decisions', 'Heartbeat only, no standing TUI'],
    ];
    for (const [id, needle] of views) {
      await iframe.evaluate((el) => el.scrollIntoView({block: 'start'}));
      await frame.locator(`[data-nav="${id}"]`).first().click();
      try {
        await frame.waitForFunction(
          ({viewId, expected}) => {
            const el = document.querySelector(`#view-${viewId}`);
            return Boolean(el && !el.hidden && (el.innerText || '').includes(expected));
          },
          {viewId: id, expected: needle},
          {timeout: 10000},
        );
      } catch {
        fail(`${id} did not show ${needle}`);
      }
      if (await banner.isVisible()) fail(`offline banner after opening ${id}`);
    }
  }
  if ((await iframe.count()) !== 1) fail('expected one demo iframe');

  await page.setViewportSize({width: 390, height: 844});
  await page.goto(origin, {waitUntil: 'networkidle'});
  const mobileBox = await page.locator('#top iframe').boundingBox();
  if (!mobileBox || mobileBox.height < 400) {
    fail(`mobile iframe height ${mobileBox ? mobileBox.height : 'missing'}`);
  }
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
} finally {
  await browser.close();
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('Landing check passed');
