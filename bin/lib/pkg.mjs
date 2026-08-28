/**
 * Package identity shared across the CLI.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Absolute path to the package root (parent of `bin/`). */
export const PKG_ROOT = fileURLToPath(new URL("../..", import.meta.url));

const pkg = JSON.parse(readFileSync(join(PKG_ROOT, "package.json"), "utf8"));

export const NAME = pkg.name;
export const CMD = Object.keys(pkg.bin ?? {})[0] ?? "mental";
export const VERSION = pkg.version;

export const SKILLS_DIR = join(PKG_ROOT, "skills");
export const RULES_DIR = join(PKG_ROOT, "rules");
export const OPTIONAL_DIR = join(PKG_ROOT, "optional");

/** Managed-block markers for user AGENTS.md / CLAUDE.md. */
export const BEGIN = `<!-- BEGIN ${CMD} (managed — edits inside are overwritten on reinstall) -->`;
export const END = `<!-- END ${CMD} -->`;
