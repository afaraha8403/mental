/**
 * Product version lockstep. `package.json` is source of truth.
 * Portable `plugin.json`, Cursor/Claude shims, lockfile, and skill
 * `metadata.version` must equal that string. Format versions (`$schema`
 * 1.0.0, INDEX_VERSION, BINDINGS_VERSION) stay separate.
 * Do not put `version` on the marketplace plugin entry (Claude: plugin.json wins).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[\w.]+)?$/;

/** JSON files whose top-level `version` must match package.json. */
export const VERSION_JSON_RELATIVE = [
  "package.json",
  "plugin.json",
  ".cursor-plugin/plugin.json",
  ".claude-plugin/plugin.json",
];

export const SKILL_RELATIVE = join("skill", "mental", "SKILL.md");
export const TRACK_SKILL_RELATIVE = join("optional", "mental-track", "SKILL.md");
export const MARKETPLACE_RELATIVE = join(".claude-plugin", "marketplace.json");
export const LOCKFILE_RELATIVE = "package-lock.json";

/**
 * @param {string} md
 * @returns {string | null}
 */
export function skillMetadataVersion(md) {
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!fm) return null;
  const ver = fm[1].match(/^  version:\s*["']?([^"'\n]+)["']?\s*$/m);
  return ver ? ver[1].trim() : null;
}

/**
 * @param {string} md
 * @param {string} version
 */
export function setSkillMetadataVersion(md, version) {
  const replaced = md.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, (block) => {
    if (/^  version:/m.test(block)) {
      return block.replace(/^  version:\s*.*$/m, `  version: "${version}"`);
    }
    if (/^metadata:\s*$/m.test(block)) {
      return block.replace(/^(metadata:\s*)$/m, `$1\n  version: "${version}"`);
    }
    return block;
  });
  return replaced;
}

function loadJson(root, rel) {
  return JSON.parse(readFileSync(join(root, rel), "utf8"));
}

function writeJson(root, rel, data) {
  writeFileSync(join(root, rel), `${JSON.stringify(data, null, 2)}\n`);
}

/**
 * @param {string} root
 * @returns {{
 *   ok: boolean,
 *   version: string | null,
 *   files: Record<string, string | null>,
 *   errors: string[],
 * }}
 */
export function readProductVersions(root) {
  /** @type {string[]} */
  const errors = [];
  /** @type {Record<string, string | null>} */
  const files = {};
  let pkgVersion = null;
  try {
    const pkg = loadJson(root, "package.json");
    pkgVersion = typeof pkg.version === "string" ? pkg.version : null;
    files["package.json"] = pkgVersion;
    if (!pkgVersion || !SEMVER_RE.test(pkgVersion)) {
      errors.push(`package.json version is not semver: ${pkgVersion}`);
    }
  } catch (err) {
    errors.push(`package.json: ${err instanceof Error ? err.message : String(err)}`);
  }

  for (const rel of VERSION_JSON_RELATIVE) {
    if (rel === "package.json") continue;
    try {
      const data = loadJson(root, rel);
      const v = typeof data.version === "string" ? data.version : null;
      files[rel] = v;
      if (pkgVersion && v !== pkgVersion) {
        errors.push(`${rel} version ${v} !== package.json ${pkgVersion}`);
      }
    } catch (err) {
      files[rel] = null;
      errors.push(`${rel}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  try {
    const lock = loadJson(root, LOCKFILE_RELATIVE);
    const lockV = typeof lock.version === "string" ? lock.version : null;
    const emptyV =
      lock.packages && lock.packages[""] && typeof lock.packages[""].version === "string"
        ? lock.packages[""].version
        : null;
    files[LOCKFILE_RELATIVE] = lockV;
    files[`${LOCKFILE_RELATIVE}#packages[""]`] = emptyV;
    if (pkgVersion && lockV !== pkgVersion) {
      errors.push(`${LOCKFILE_RELATIVE} version ${lockV} !== package.json ${pkgVersion}`);
    }
    if (pkgVersion && emptyV && emptyV !== pkgVersion) {
      errors.push(`${LOCKFILE_RELATIVE} packages[""].version ${emptyV} !== package.json ${pkgVersion}`);
    }
  } catch (err) {
    files[LOCKFILE_RELATIVE] = null;
    errors.push(`${LOCKFILE_RELATIVE}: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const md = readFileSync(join(root, SKILL_RELATIVE), "utf8");
    const skillV = skillMetadataVersion(md);
    files[SKILL_RELATIVE] = skillV;
    if (pkgVersion && skillV !== pkgVersion) {
      errors.push(`${SKILL_RELATIVE} metadata.version ${skillV} !== package.json ${pkgVersion}`);
    }
  } catch (err) {
    files[SKILL_RELATIVE] = null;
    errors.push(`${SKILL_RELATIVE}: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const md = readFileSync(join(root, TRACK_SKILL_RELATIVE), "utf8");
    const skillV = skillMetadataVersion(md);
    files[TRACK_SKILL_RELATIVE] = skillV;
    if (pkgVersion && skillV !== pkgVersion) {
      errors.push(`${TRACK_SKILL_RELATIVE} metadata.version ${skillV} !== package.json ${pkgVersion}`);
    }
  } catch {
    files[TRACK_SKILL_RELATIVE] = null;
  }

  try {
    const market = loadJson(root, MARKETPLACE_RELATIVE);
    const entry = Array.isArray(market.plugins) ? market.plugins[0] : null;
    if (entry && "version" in entry) {
      errors.push(
        `${MARKETPLACE_RELATIVE} plugins[0] must not set version (Claude uses plugin.json; dual-set is a footgun)`,
      );
    }
    files[MARKETPLACE_RELATIVE] = entry && "version" in entry ? String(entry.version) : null;
  } catch (err) {
    errors.push(`${MARKETPLACE_RELATIVE}: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { ok: errors.length === 0, version: pkgVersion, files, errors };
}

/**
 * Write the product version into every lockstep file.
 * @param {string} root
 * @param {string} version
 */
export function applyProductVersion(root, version) {
  if (!SEMVER_RE.test(version)) {
    throw new Error(`version must be semver (got ${version})`);
  }
  for (const rel of VERSION_JSON_RELATIVE) {
    const data = loadJson(root, rel);
    data.version = version;
    writeJson(root, rel, data);
  }
  try {
    const lock = loadJson(root, LOCKFILE_RELATIVE);
    lock.version = version;
    if (lock.packages && lock.packages[""]) lock.packages[""].version = version;
    writeJson(root, LOCKFILE_RELATIVE, lock);
  } catch {
    // lockfile optional in fixtures
  }
  const skillFile = join(root, SKILL_RELATIVE);
  const md = readFileSync(skillFile, "utf8");
  writeFileSync(skillFile, setSkillMetadataVersion(md, version));
  try {
    const trackFile = join(root, TRACK_SKILL_RELATIVE);
    const trackMd = readFileSync(trackFile, "utf8");
    writeFileSync(trackFile, setSkillMetadataVersion(trackMd, version));
  } catch {
    // optional track skill may be absent in fixtures
  }
}
