#!/usr/bin/env node
/**
 * Seed a throwaway Mental home, open the real dashboard, capture CLI output,
 * and write WebP/PNG/GIF into public/screenshots/.
 */
import {spawn, spawnSync} from 'node:child_process';
import {mkdirSync, writeFileSync, copyFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {chromium} from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const websiteRoot = join(here, '..');
const repoRoot = join(websiteRoot, '..');
const outDir = join(websiteRoot, 'public', 'screenshots');
const cliBin = join(repoRoot, 'bin', 'cli.mjs');
const demoHome = join(tmpdir(), 'mental-site-demo');
const port = 3847;

mkdirSync(outDir, {recursive: true});
mkdirSync(demoHome, {recursive: true});

const env = {
  ...process.env,
  HOME: demoHome,
  USERPROFILE: demoHome,
  XDG_CACHE_HOME: join(demoHome, '.cache'),
  XDG_CONFIG_HOME: join(demoHome, '.config'),
  MENTAL_SKIP_UPDATE_CHECK: '1',
  MENTAL_SKIP_HOST_PLUGIN_CHECK: '1',
  MENTAL_NO_HINTS: '1',
  NO_COLOR: '',
  FORCE_COLOR: '1',
  TERM: 'xterm-256color',
  COLORTERM: 'truecolor',
};

function runMental(args, {cwd = repoRoot} = {}) {
  const result = spawnSync(process.execPath, [cliBin, ...args], {
    cwd,
    env,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `mental ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}

function runTty(args) {
  const quoted = [process.execPath, cliBin, ...args]
    .map((a) => `'${String(a).replace(/'/g, `'\\''`)}'`)
    .join(' ');
  const result = spawnSync('script', ['-qefc', quoted, '/dev/null'], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  return (result.stdout || '').replace(/\r/g, '');
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
}

console.log('Installing Mental into demo HOME…');
runMental(['install']);

console.log('Seeding journal, decisions, attention, notes…');
runMental([
  'journal',
  '--title',
  'Resolver landed',
  '--body',
  'UUID bindings survive a repo move. Tests cover remap after a folder rename.',
  '--resume',
  'Ship the pointer, not the dump. Open loops: none',
  '--against',
  'PLAN.md',
  '--via',
  'cursor',
]);
runMental([
  'decide',
  '--title',
  'Heartbeat only, no standing TUI',
  '--body',
  'Default TTY mental prints a one-shot heartbeat and exits. Optional dashboard is a localhost page over the same files.',
  '--status',
  'decided',
  '--tag',
  'cli',
  '--via',
  'cursor',
]);
runMental([
  'decide',
  '--title',
  'OKF markdown is the source of truth',
  '--body',
  'SQLite is a derived cache. Deleting the db loses nothing.',
  '--tag',
  'okf',
  '--via',
  'cursor',
]);
runMental([
  'attention',
  '--title',
  'Resolver tests not reviewed',
  '--kind',
  'verify',
  '--tag',
  'verify',
  '--via',
  'cursor',
]);
runMental([
  'attention',
  '--title',
  'Tom said ship the pointer',
  '--kind',
  'direction',
  '--from',
  'Tom',
  '--tag',
  'direction',
  '--via',
  'cursor',
]);
runMental([
  'attention',
  '--title',
  'Come back to MCP',
  '--kind',
  'thread',
  '--status',
  'later',
  '--tag',
  'mcp',
  '--via',
  'cursor',
]);
runMental([
  'note',
  '--title',
  'Identity is a UUID in bindings.json',
  '--tag',
  'identity',
  '--description',
  'Two clones of the same origin share one brain until you split.',
]);

console.log('Capturing CLI output…');
const helpOut = runTty(['--help']);
const heartbeatOut = runTty(['heartbeat']);
runMental(['park', '--resume', 'Write the marketing site next. Open loops: none']);
const parkOut = runTty(['park', '--resume', 'Write the marketing site next. Open loops: none']);

writeFileSync(join(outDir, 'cli-help.txt'), stripAnsi(helpOut));
writeFileSync(join(outDir, 'cli-heartbeat.txt'), stripAnsi(heartbeatOut));
writeFileSync(join(outDir, 'cli-park.txt'), stripAnsi(parkOut));

function terminalHtml(title, body) {
  const escaped = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<style>
  html, body { margin: 0; background: #09090b; }
  .term {
    width: 920px;
    background: #111114;
    border: 1px solid #232329;
    border-radius: 14px;
    box-shadow: 0 24px 64px -12px rgba(0,0,0,0.7);
    overflow: hidden;
    font-family: "JetBrains Mono", ui-monospace, Menlo, Consolas, monospace;
  }
  .bar {
    height: 40px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 14px;
    border-bottom: 1px solid #232329;
    background: #18181c;
    color: #a1a1aa;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
    font-size: 12px;
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; }
  .d1 { background: #fb7185; } .d2 { background: #f59e0b; } .d3 { background: #34d399; }
  pre {
    margin: 0;
    padding: 18px 20px 22px;
    color: #ededf0;
    font-size: 13px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
  }
</style></head>
<body>
  <div class="term">
    <div class="bar">
      <span class="dot d1"></span><span class="dot d2"></span><span class="dot d3"></span>
      <span>${title}</span>
    </div>
    <pre>${escaped}</pre>
  </div>
</body></html>`;
}

console.log('Starting dashboard…');
const dash = spawn(process.execPath, [cliBin, 'dashboard', '--no-open', '--port', String(port)], {
  cwd: repoRoot,
  env,
  stdio: ['ignore', 'pipe', 'pipe'],
});
let dashReady = '';
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('dashboard start timeout')), 15000);
  const onData = (buf) => {
    dashReady += buf.toString();
    if (/http:\/\/127\.0\.0\.1:\d+/.test(dashReady)) {
      clearTimeout(timer);
      resolve();
    }
  };
  dash.stdout.on('data', onData);
  dash.stderr.on('data', onData);
  dash.on('error', reject);
});

const browser = await chromium.launch({args: ['--font-render-hinting=none']});
const page = await browser.newPage({viewport: {width: 1440, height: 900}, deviceScaleFactor: 2});

async function shotHtml(name, html) {
  await page.setContent(html, {waitUntil: 'load'});
  const el = page.locator('.term');
  await el.screenshot({path: join(outDir, `${name}.png`)});
  await el.screenshot({path: join(outDir, `${name}.webp`), type: 'webp', quality: 82});
}

await shotHtml('cli-help', terminalHtml('mental --help', stripAnsi(helpOut).trim()));
await shotHtml('cli-heartbeat', terminalHtml('mental heartbeat', stripAnsi(heartbeatOut).trim()));
await shotHtml('cli-park', terminalHtml('mental park', stripAnsi(parkOut).trim()));

await page.setViewportSize({width: 1440, height: 900});
await page.addInitScript(() => {
  localStorage.setItem('mental-dashboard-theme', 'dark');
});

async function waitForView() {
  await page.waitForSelector('.app', {timeout: 15000});
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.body.classList.add('ready');
  });
  await page.waitForTimeout(800);
}

async function shotDash(hash, file) {
  await page.goto(`http://127.0.0.1:${port}/${hash}`, {waitUntil: 'networkidle'});
  await waitForView();
  const png = join(outDir, `${file}.png`);
  const webp = join(outDir, `${file}.webp`);
  await page.screenshot({path: png, fullPage: false});
  await page.screenshot({path: webp, type: 'webp', quality: 82, fullPage: false});
}

await shotDash('#/today', 'dashboard-today');
await shotDash('#/attention', 'dashboard-attention');
await shotDash('#/decisions', 'dashboard-decisions');
await shotDash('#/library', 'dashboard-journal');

const gifFrames = ['dashboard-today.png', 'dashboard-attention.png', 'dashboard-decisions.png'];
const ffmpeg = spawnSync(
  'ffmpeg',
  [
    '-y',
    ...gifFrames.flatMap((f) => ['-loop', '1', '-t', '1.2', '-i', join(outDir, f)]),
    '-filter_complex',
    'concat=n=3:v=1:a=0,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=bayer',
    join(outDir, 'dashboard-loop.gif'),
  ],
  {encoding: 'utf8'},
);
if (ffmpeg.status !== 0) {
  console.warn('ffmpeg gif skipped:', ffmpeg.stderr?.slice(-400));
  const first = join(outDir, 'dashboard-today.png');
  if (existsSync(first)) copyFileSync(first, join(outDir, 'dashboard-loop.gif'));
}

await browser.close();
dash.kill('SIGINT');
console.log('Wrote screenshots to', outDir);
