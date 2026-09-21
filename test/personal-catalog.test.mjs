import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringifyFrontmatter } from "../bin/lib/okf.mjs";
import { mental, tempHome } from "./helpers.mjs";

test("personal-mode list and search do not walk ~/.mental/projects", () => {
  const home = tempHome();
  const personal = join(home, ".mental");
  mkdirSync(join(personal, "notes"), { recursive: true });
  mkdirSync(join(personal, "projects", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "notes"), {
    recursive: true,
  });
  writeFileSync(
    join(personal, "notes", "mine.md"),
    stringifyFrontmatter({ type: "Note", title: "Personal only note", status: "active", tags: [] }, "personal body\n"),
  );
  writeFileSync(
    join(personal, "projects", "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", "notes", "leak.md"),
    stringifyFrontmatter(
      { type: "Note", title: "Slice leak token UNIQUELEAK", status: "active", tags: [] },
      "should not appear in personal catalog\n",
    ),
  );

  const listed = mental(home, home, ["list", "--json", "--type", "Note"]);
  assert.equal(listed.status, 0, listed.stderr || listed.stdout);
  const items = JSON.parse(listed.stdout);
  assert.equal(items.data.mode, "personal");
  assert.ok(items.data.items.some((i) => i.title === "Personal only note"));
  assert.equal(
    items.data.items.some((i) => i.path.startsWith("projects/") || i.title.includes("UNIQUELEAK")),
    false,
    JSON.stringify(items.data.items),
  );

  const search = mental(home, home, ["search", "--json", "UNIQUELEAK"]);
  assert.equal(search.status, 0, search.stderr || search.stdout);
  const hits = JSON.parse(search.stdout);
  assert.equal(hits.data.hits.length, 0, JSON.stringify(hits.data.hits));
});
