#!/usr/bin/env node
/**
 * Record dashboard API responses from a throwaway sample session.
 * The marketing demo replays this file. It never reads ~/.mental.
 */
import {rmSync, writeFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {listenDashboard} from '../../bin/lib/dashboard.mjs';
import {gitEnv, initRepo, mental, tempHome} from '../../test/helpers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outFile = join(here, '..', 'public', 'demo', 'fixture.json');
const DEMO_ID = '11111111-1111-4111-8111-111111111111';
const RESUME = 'Ship the pointer, not the dump. Open loops: none';

/**
 * Query string the dashboard builds: project id first, then the rest.
 * @param {Record<string, string | number>} params
 */
function queryKey(pathname, params) {
  const search = new URLSearchParams();
  if (params.id != null && params.id !== '') search.set('id', String(params.id));
  for (const [key, value] of Object.entries(params)) {
    if (key === 'id' || value == null || value === '') continue;
    search.set(key, String(value));
  }
  const serialized = search.toString();
  return pathname + (serialized ? `?${serialized}` : '');
}

/**
 * @param {string} home
 * @param {string} cwd
 * @param {string[]} args
 */
function run(home, cwd, args) {
  const result = mental(home, cwd, args, {MENTAL_NO_HINTS: '1'});
  if (result.status !== 0) {
    throw new Error(
      `mental ${args.join(' ')} failed (${result.status}): ${result.stderr || result.stdout}`,
    );
  }
}

/**
 * Replace the temp store, the temp repo, and the real project id.
 * @param {string} text
 * @param {{ home: string, root: string, id: string }} scrub
 */
function scrubText(text, scrub) {
  return text
    .split(scrub.root)
    .join('/sample/repo')
    .split(scrub.home)
    .join('/sample/home')
    .split(scrub.id)
    .join(DEMO_ID);
}

const home = tempHome('mental-demo-fixture-');
let server;
try {
  const {root} = initRepo(home, {
    name: 'sample',
    origin: 'https://github.com/example/sample.git',
  });
  run(home, root, ['install']);
  run(home, root, [
    'journal',
    '--title',
    'Resolver landed',
    '--body',
    'UUID bindings survive a repo move. Tests cover remap after a folder rename.',
    '--resume',
    RESUME,
    '--against',
    'PLAN.md',
    '--via',
    'cursor',
  ]);
  run(home, root, [
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
  run(home, root, [
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
  run(home, root, [
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
  run(home, root, [
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
  run(home, root, [
    'note',
    '--title',
    'Identity is a UUID in bindings.json',
    '--tag',
    'identity',
    '--description',
    'Two clones of the same origin share one brain until you split.',
  ]);

  server = await listenDashboard({
    cwd: root,
    home,
    env: gitEnv(home),
    port: 0,
    open: false,
    portFile: false,
  });
  const base = `http://127.0.0.1:${server.port}`;

  /**
   * @param {string} key
   */
  async function record(key) {
    const response = await fetch(base + key);
    const body = await response.json();
    return body;
  }

  const boot = await record('/api/boot');
  if (!boot?.ok || !boot.data?.id) {
    throw new Error('Sample dashboard boot did not return a project id.');
  }
  const id = boot.data.id;
  const withId = (pathname, extra = {}) => queryKey(pathname, {id, ...extra});

  const listAttention = withId('/api/list', {type: 'Attention', limit: 100, offset: 0});
  const listDecision = withId('/api/list', {type: 'Decision', limit: 100, offset: 0});
  const listLibrary = withId('/api/list', {limit: 100, offset: 0});
  const routes = {
    '/api/boot': boot,
    [withId('/api/boot')]: await record(withId('/api/boot')),
    [withId('/api/heartbeat')]: await record(withId('/api/heartbeat')),
    [withId('/api/activity', {days: 30})]: await record(withId('/api/activity', {days: 30})),
    [listAttention]: await record(listAttention),
    [listDecision]: await record(listDecision),
    [listLibrary]: await record(listLibrary),
    [withId('/api/graph')]: await record(withId('/api/graph')),
    [withId('/api/search', {q: 'pointer', limit: 100})]: await record(
      withId('/api/search', {q: 'pointer', limit: 100}),
    ),
    '/api/projects': await record('/api/projects'),
  };

  const attentionItems = routes[listAttention]?.data?.items || [];
  const decisionItems = routes[listDecision]?.data?.items || [];
  const samplePaths = [attentionItems[0]?.path, decisionItems[0]?.path].filter(Boolean);
  for (const path of samplePaths) {
    const show = withId('/api/show', {path});
    const why = withId('/api/why', {path});
    routes[show] = await record(show);
    routes[why] = await record(why);
  }

  let text = JSON.stringify({routes}, null, 2);
  text = scrubText(text, {home, root, id});
  const leaked = [homedir(), home, root].filter((part) => part && text.includes(part));
  if (leaked.length || text.includes('/home/')) {
    throw new Error('Fixture still contains a real filesystem path.');
  }
  if (!text.includes(RESUME)) {
    throw new Error('Fixture is missing the sample resume line.');
  }
  writeFileSync(outFile, text + '\n');
  console.log('Wrote', outFile);
} finally {
  if (server) await server.close();
  rmSync(home, {recursive: true, force: true});
}
