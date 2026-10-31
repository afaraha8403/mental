#!/usr/bin/env node
/**
 * Copy the real dashboard assets into the marketing demo.
 * Leaves the hand-written shell, fetch shim, and fixture in place.
 */
import {cpSync, mkdirSync, readdirSync, statSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const src = join(repoRoot, 'assets', 'dashboard');
const dst = join(here, '..', 'public', 'demo');
const protect = new Set(['index.html', 'fixture-shim.js', 'fixture.json']);

/**
 * Copy one dashboard file or directory, skipping the demo's own files.
 * @param {string} from
 * @param {string} to
 */
function copyTree(from, to) {
  mkdirSync(to, {recursive: true});
  for (const name of readdirSync(from)) {
    if (protect.has(name)) continue;
    const srcPath = join(from, name);
    const dstPath = join(to, name);
    if (statSync(srcPath).isDirectory()) {
      copyTree(srcPath, dstPath);
    } else {
      cpSync(srcPath, dstPath);
    }
  }
}

copyTree(src, dst);
console.log('Synced dashboard assets to', dst);
