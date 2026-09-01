#!/usr/bin/env node
/**
 * One-time migration away from Mental 0.7/0.8 launchers.
 *
 * npm owns current launchers. This command has a distinct bin name so it stays
 * reachable when a legacy `mental` shadows npm and opens Windows' file chooser.
 */
import { homeFromEnv, repairLegacyBins } from "./lib/install-cli.mjs";
import { isCliEntry } from "./lib/entry.mjs";

export function runRepair({
  argv = process.argv.slice(2),
  env = process.env,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const json = argv.includes("--json");
  const home = homeFromEnv(env);
  if (!home) {
    const error = { code: "no-home", message: "HOME is unset; no launchers changed." };
    if (json) stdout.write(`${JSON.stringify({ ok: false, error })}\n`);
    else stderr.write(`mental-repair: ${error.message}\n`);
    return 1;
  }

  const result = repairLegacyBins({ home, env });
  if (json) {
    stdout.write(
      `${JSON.stringify(
        result.ok
          ? { ok: true, data: result }
          : {
              ok: false,
              error: {
                code: result.reason,
                message: repairMessage(result),
              },
              data: result,
            },
      )}\n`,
    );
  } else if (result.ok) {
    stdout.write(
      result.moved.length
        ? `mental-repair: quarantined ${result.moved.length} legacy launcher(s)\n`
        : "mental-repair: launchers already clean\n",
    );
    for (const item of result.moved) stdout.write(`  ${item.from} -> ${item.to}\n`);
    for (const item of result.unknown) {
      stdout.write(`  preserved unknown path: ${item.path}\n`);
    }
    stdout.write("mental-repair: npm launcher verified; run `mental install` then `mental doctor`\n");
  } else {
    stderr.write(`mental-repair: ${repairMessage(result)}\n`);
    for (const path of result.restored) stderr.write(`  restored ${path}\n`);
  }
  return result.ok ? 0 : 1;
}

function repairMessage(result) {
  if (result.reason === "npm-prefix-unavailable") {
    return "could not read the active global npm prefix; nothing changed";
  }
  if (result.reason === "npm-bin-not-on-path") {
    return `active npm bin is not on PATH (${result.npmBinDir}); nothing changed`;
  }
  if (result.reason === "npm-launcher-failed") {
    return "npm's mental launcher failed verification; legacy launchers restored";
  }
  if (result.reason === "quarantine-failed") {
    return `could not quarantine legacy launchers; changes rolled back (${result.error || "unknown error"})`;
  }
  return result.reason || "repair failed";
}

if (isCliEntry(import.meta.url)) {
  process.exitCode = runRepair();
}
