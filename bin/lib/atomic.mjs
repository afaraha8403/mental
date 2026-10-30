/**
 * Crash-safe writes and an exclusive lock for read-modify-write.
 * A crash mid-write leaves the previous file. Two agents serialize on the lock.
 */
import { closeSync, constants, mkdirSync, openSync, renameSync, unlinkSync, writeFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

/** @type {Map<string, number>} */
const held = new Map();

const STALE_MS = 30_000;

/**
 * @param {string} file
 * @param {string | Buffer} contents
 * @param {{ mode?: number }} [opts]
 */
export function writeAtomic(file, contents, opts = {}) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = join(dirname(file), `.${process.pid}.${randomBytes(4).toString("hex")}.tmp`);
  writeFileSync(tmp, contents, opts.mode != null ? { mode: opts.mode } : undefined);
  try {
    renameSync(tmp, file);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // the rename already failed; the temp file is best-effort
    }
    throw err;
  }
}

/**
 * Exclusive lock. Reentrant in this process. A lock older than 30s is treated
 * as abandoned (the holder crashed) and replaced.
 * @template T
 * @param {string} lockPath
 * @param {() => T} fn
 * @returns {T}
 */
export function withFileLock(lockPath, fn) {
  const depth = held.get(lockPath) || 0;
  if (depth > 0) {
    held.set(lockPath, depth + 1);
    try {
      return fn();
    } finally {
      const next = (held.get(lockPath) || 1) - 1;
      if (next <= 0) held.delete(lockPath);
      else held.set(lockPath, next);
    }
  }
  mkdirSync(dirname(lockPath), { recursive: true });
  const start = Date.now();
  /** @type {number | undefined} */
  let fd;
  for (;;) {
    try {
      fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
      break;
    } catch (err) {
      const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
      if (code !== "EEXIST") throw err;
      try {
        const st = statSync(lockPath);
        if (Date.now() - st.mtimeMs > STALE_MS) {
          unlinkSync(lockPath);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - start > 5000) {
        throw Object.assign(new Error(`lock busy: ${lockPath}`), { code: "lock" });
      }
      const sab = new Int32Array(new SharedArrayBuffer(4));
      Atomics.wait(sab, 0, 0, 15);
    }
  }
  held.set(lockPath, 1);
  try {
    writeFileSync(fd, String(process.pid));
    return fn();
  } finally {
    held.delete(lockPath);
    try {
      closeSync(fd);
    } catch {
      // already closed
    }
    try {
      unlinkSync(lockPath);
    } catch {
      // the next waiter treats a stale lock as abandoned
    }
  }
}
