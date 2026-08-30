/**
 * `mental show <path>` — one OKF file relative to the bundle root.
 */
import { resolveBundle } from "../lib/resolve.mjs";
import { readBundleFile } from "../lib/okf.mjs";
import { listBacklinks } from "../lib/index.mjs";
import { printResult, kindLine, EXIT_USAGE } from "../lib/output.mjs";

export function cmdShow(args, io = {}) {
  const stdout = io.stdout ?? process.stdout;
  const rel = (args.rest[0] || (typeof args.flags?.path === "string" ? args.flags.path : "")).trim();
  if (!rel) {
    printResult(stdout, args, false, undefined, {
      code: "usage",
      message: "mental show requires a path relative to the bundle root",
    });
    return EXIT_USAGE;
  }
  const resolved = resolveBundle({
    cwd: args.cwd ?? process.cwd(),
    home: args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null,
    env: args.env ?? process.env,
    dir: args.dir ?? null,
    write: false,
  });
  if (!resolved.ok) {
    printResult(stdout, args, false, undefined, resolved.error);
    return 1;
  }
  const file = readBundleFile(resolved.data.root, rel);
  if (!file.ok) {
    printResult(stdout, args, false, undefined, file.error);
    return 1;
  }
  const home = args.home ?? process.env.HOME ?? process.env.USERPROFILE ?? null;
  const backlinks = listBacklinks({
    root: resolved.data.root,
    path: file.data.path.split("#")[0],
    id: resolved.data.id,
    home,
    env: args.env ?? process.env,
  });
  const payload = {
    ...resolved.data,
    path: file.data.path,
    frontmatter: file.data.data,
    body: file.data.body,
    backlinks,
  };
  printResult(stdout, args, true, payload, undefined, (d) => {
    const title = typeof d.frontmatter.title === "string" ? d.frontmatter.title : d.path;
    const type = typeof d.frontmatter.type === "string" ? d.frontmatter.type : "";
    const head = type ? `${title}  [${type}]` : title;
    const linked =
      d.backlinks.length === 0
        ? ""
        : `\n\nLinked from:\n${d.backlinks.map((b) => `  [${b.type}] ${b.title} (${b.path})`).join("\n")}`;
    return `${kindLine("read", head)}\n${d.path}\n\n${d.body.trim() || "(empty)"}${linked}`;
  });
  return 0;
}
