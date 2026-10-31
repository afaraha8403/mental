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
      leads: ['Git records what changed', 'Your agents write it', 'Files stay on this machine'].map(
        (lead) => {
          const el = [...document.querySelectorAll('h3')].find((node) => node.textContent?.trim() === lead);
          if (!el) return null;
          return el.getBoundingClientRect().top + window.scrollY;
        },
      ),
      install: y('#install'),
      iframe: y('iframe[src*="/demo/"]'),
      claude: y('#claude'),
      how: y('#how'),
      installText: document.querySelector('#install')?.textContent ?? '',
    };
  });

  if (order.h1 !== 'Picking up where your AI agents left off') {
    fail(`h1 was ${JSON.stringify(order.h1)}`);
  }
  if (order.installCount !== 1) fail(`expected one #install, found ${order.installCount}`);
  for (const [index, leadY] of order.leads.entries()) {
    if (leadY == null) fail(`missing value lead ${index}`);
    else if (order.install == null || leadY >= order.install) {
      fail(`value lead ${index} is not above #install`);
    }
  }
  if (order.install == null || order.iframe == null || order.install >= order.iframe) {
    fail('#install is not above the demo iframe');
  }
  if (order.claude == null || order.how == null || order.claude >= order.how) {
    fail('#claude is not before #how');
  }
  for (const command of ['npm i -g @balacode/mental', 'mental install', 'mental doctor']) {
    if (!order.installText.includes(command)) fail(`#install missing ${command}`);
  }

  const iframe = page.locator('iframe[src*="/demo/"]');
  const frame = page.frame({url: /\/demo\/index\.html/});
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
