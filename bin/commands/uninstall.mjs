/**
 * `mental uninstall` — remove skill/rule/hooks Mental copied into user agent dirs.
 * Does not delete ~/.mental unless `--delete-data DELETE`.
 */
import { existsSync, rmSync } from "node:fs";
import { userMentalDir } from "../lib/bindings.mjs";
import { uninstallSkills } from "../lib/uninstall.mjs";
import { disableHooks } from "../lib/hooks.mjs";
import { printResult } from "../lib/output.mjs";

export function cmdUninstall(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  if (!home) {
    printResult(stdout, args.json, false, undefined, {
      code: "no-home",
      message: "HOME is unset; nothing to uninstall.",
    });
    return 1;
  }

  const deleteData = Boolean(args.flags?.["delete-data"]);
  const confirm = typeof args.flags?.confirm === "string" ? args.flags.confirm : args.rest[0] || "";
  if (deleteData && confirm !== "DELETE") {
    printResult(stdout, args.json, false, undefined, {
      code: "usage",
      message: "Refusing to delete OKF. Pass --delete-data --confirm DELETE to wipe ~/.mental.",
    });
    return 1;
  }

  const skills = uninstallSkills({
    home,
    projectDir: args.flags?.project ? args.cwd ?? process.cwd() : null,
  });
  const hooks = disableHooks(home);
  let wiped = null;
  if (deleteData && confirm === "DELETE") {
    const root = userMentalDir(home);
    if (existsSync(root)) {
      rmSync(root, { recursive: true, force: true });
      wiped = root;
    }
  }

  printResult(
    stdout,
    args.json,
    true,
    { removed: skills.removed, hooks: hooks.written, wiped },
    undefined,
    () =>
      `removed ${skills.removed.length} skill/rule path(s)${wiped ? `\nwiped ${wiped}` : "\nOKF left in place (~/.mental)"}`,
  );
  return 0;
}
