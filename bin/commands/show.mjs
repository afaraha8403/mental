/**
 * `mental show <path>` — one OKF file relative to the bundle root.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { readBundleFile } from "../lib/okf.mjs";
import { printResult } from "../lib/output.mjs";

export function cmdShow(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const rel = (args.rest[0] || (typeof args.flags?.path === "string" ? args.flags.path : "")).trim();
  if (!rel) {
    printResult(stdout, args.json, false, undefined, {
      code: "usage",
      message: "mental show requires a path relative to the bundle root",
    });
    return 1;
  }
  const resolved = resolveBundle({
    cwd: args.cwd ?? process.cwd(),
    home: args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null,
    env: args.env ?? process.env,
    dir: args.dir ?? null,
    write: false,
  });
  if (!resolved.ok) {
    printResult(stdout, args.json, false, undefined, resolved.error);
    return 1;
  }
  const file = readBundleFile(resolved.data.root, rel);
  if (!file.ok) {
    printResult(stdout, args.json, false, undefined, file.error);
    return 1;
  }
  const payload = {
    ...resolved.data,
    path: file.data.path,
    frontmatter: file.data.data,
    body: file.data.body,
  };
  printResult(stdout, args.json, true, payload, undefined, (d) => {
    const title = typeof d.frontmatter.title === "string" ? d.frontmatter.title : d.path;
    const type = typeof d.frontmatter.type === "string" ? d.frontmatter.type : "";
    const head = type ? `${title}  [${type}]` : title;
    return `${head}\n${d.path}\n\n${d.body.trim() || "(empty)"}`;
  });
  return 0;
}
