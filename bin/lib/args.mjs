/**
 * Shared CLI argument helpers. Known flags come from the catalog.
 */
import { formatUsageFull, allFlagsByName, knownFlagNames, getCommand } from "./catalog.mjs";

export { formatUsageFull as usage, formatUsageShort, formatCommandHelp } from "./catalog.mjs";

const GLOBAL_TOP = new Set(["json", "dir", "help", "version", "plain", "no-color"]);

/**
 * Parse argv into a structured args object.
 * Global flags may appear before or after the command.
 * After `--`, remaining tokens go to rest (POSIX).
 *
 * @param {string[]} argv
 */
export function parseArgv(argv) {
  const args = {
    command: null,
    json: false,
    dir: undefined,
    help: false,
    helpLong: false,
    version: false,
    plain: false,
    /** @type {string[]} */
    rest: [],
    /** @type {Record<string, string | boolean>} */
    flags: {},
    /** @type {string[]} */
    unknownFlags: [],
    /** @type {string | null} */
    parseError: null,
  };

  const byName = allFlagsByName();

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      args.rest.push(...argv.slice(i + 1));
      break;
    }
    if (a === "-h") {
      args.help = true;
      continue;
    }
    if (a === "--help") {
      args.help = true;
      args.helpLong = true;
      continue;
    }
    if (a === "-v" || a === "--version") {
      args.version = true;
      continue;
    }

    let name = null;
    /** @type {string | boolean | undefined} */
    let value;
    let explicitEquals = false;

    if (a.startsWith("--") && a.includes("=")) {
      const eq = a.indexOf("=");
      name = a.slice(2, eq);
      value = a.slice(eq + 1);
      explicitEquals = true;
    } else if (a.startsWith("--")) {
      name = a.slice(2);
    } else if (!args.command) {
      args.command = a;
      continue;
    } else {
      args.rest.push(a);
      continue;
    }

    if (name === "json") {
      if (explicitEquals && value !== "" && value !== "true") {
        args.parseError = "--json does not take a value";
        continue;
      }
      args.json = true;
      continue;
    }
    if (name === "dir") {
      if (!explicitEquals) {
        const next = argv[i + 1];
        if (next == null || next.startsWith("-")) {
          args.parseError = "--dir requires a path";
          continue;
        }
        value = argv[++i];
      }
      args.dir = String(value);
      continue;
    }
    if (name === "plain" || name === "no-color") {
      args.plain = true;
      args.flags[name] = true;
      continue;
    }
    if (name === "help") {
      args.help = true;
      args.helpLong = true;
      continue;
    }
    if (name === "version") {
      args.version = true;
      continue;
    }

    const spec = byName.get(name);
    if (!spec) {
      args.unknownFlags.push(name);
      continue;
    }

    const takes = spec.takesValue === undefined ? true : spec.takesValue;
    if (takes === false) {
      if (explicitEquals && value !== "" && value !== "true") {
        args.parseError = `--${name} does not take a value`;
        continue;
      }
      args.flags[name] = true;
      continue;
    }
    if (takes === "optional") {
      if (explicitEquals) {
        args.flags[name] = value === "" ? true : value;
        continue;
      }
      const next = argv[i + 1];
      if (next == null || next.startsWith("-")) {
        args.flags[name] = true;
      } else {
        args.flags[name] = argv[++i];
      }
      continue;
    }
    if (!explicitEquals) {
      const next = argv[i + 1];
      if (next == null) {
        args.parseError = `--${name} requires a value`;
        continue;
      }
      value = argv[++i];
    }
    args.flags[name] = value;
  }

  if (args.command && getCommand(args.command)) {
    const known = knownFlagNames(args.command);
    for (const key of Object.keys(args.flags)) {
      if (GLOBAL_TOP.has(key)) continue;
      if (!known.has(key) && !args.unknownFlags.includes(key)) args.unknownFlags.push(key);
    }
  }

  return args;
}
