import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadBindings, saveBindings } from "../bin/lib/bindings.mjs";
import { stringifyFrontmatter } from "../bin/lib/okf.mjs";
import { TIME_DB } from "../bin/lib/time.mjs";
import {
  fingerprintMental,
  initRepo,
  liveMentalDir,
  mental,
  snapshotLiveMental,
  tempHome,
} from "./helpers.mjs";

function parseOk(r, label = "mental") {
  assert.equal(r.status, 0, `${label} failed: ${r.stderr || r.stdout}`);
  const json = JSON.parse(r.stdout);
  assert.equal(json.ok, true, `${label} ok=false: ${r.stdout}`);
  return json.data;
}

function parseErr(r) {
  const json = JSON.parse(r.stdout);
  assert.equal(json.ok, false, r.stdout);
  return json.error;
}

function hopCount(file) {
  if (!existsSync(file)) return 0;
  return (readFileSync(file, "utf8").match(/^## /gm) || []).length;
}

function journalDir(home, id) {
  return join(home, ".mental", "projects", id, "journal");
}

function firstJournalText(home, id) {
  const dir = journalDir(home, id);
  const name = readdirSync(dir).find((f) => f.endsWith(".md"));
  assert.ok(name, `no journal in ${dir}`);
  return readFileSync(join(dir, name), "utf8");
}

function walkNames(root) {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (name.isDirectory()) walk(join(dir, name.name));
      else out.push(name.name);
    }
  };
  walk(root);
  return out;
}

function writeClashJournal(root, heading, body, day = "2026-09-21") {
  const dir = join(root, "journal");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${day}.md`),
    stringifyFrontmatter(
      {
        type: "Journal",
        title: `Journal — ${day}`,
        tags: ["journal"],
        timestamp: `${day}T18:00:00.000Z`,
        status: "active",
      },
      `# ${day}\n\n## ${heading}\n${body}\n`,
    ),
  );
}

function writeConcept(root, dirName, type, slug, title, body, timestamp, extra = {}) {
  const dir = join(root, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${slug}.md`),
    stringifyFrontmatter(
      {
        type,
        title,
        tags: [type.toLowerCase()],
        timestamp,
        status: extra.status || (type === "Decision" ? "decided" : type === "Attention" ? "open" : "active"),
        ...extra,
      },
      body,
    ),
  );
}

function writeDecision(root, slug, title, body, timestamp) {
  writeConcept(root, "decisions", "Decision", slug, title, body, timestamp);
}

function writeAttention(root, slug, title, body, timestamp) {
  writeConcept(root, "attention", "Attention", slug, title, body, timestamp, { kind: "concern" });
}

function writeNote(root, slug, title, body, timestamp) {
  writeConcept(root, "notes", "Note", slug, title, body, timestamp);
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("backup --out missing or inside repo is usage", () => {
  const home = tempHome();
  const { root } = initRepo(home, { name: "in-repo", origin: "https://github.com/org/in-repo.git" });
  parseOk(mental(home, root, ["journal", "--json", "--title", "Seed", "--resume", "next"]), "seed");
  const missing = mental(home, root, ["backup", "--json"]);
  assert.equal(missing.status, 2, missing.stdout);
  assert.equal(parseErr(missing).code, "usage");
  const inside = mental(home, root, ["backup", "--json", "--out", join(root, "oops")]);
  assert.equal(inside.status, 2, inside.stdout);
  assert.match(parseErr(inside).message, /outside the git worktree/);
  assert.equal(existsSync(join(root, "oops")), false);
});

test("backup refuses --out inside ~/.mental and empty homes", () => {
  const home = tempHome("mental-empty-");
  const { root } = initRepo(home, { name: "empty", origin: "https://github.com/org/empty.git" });
  const empty = mental(home, root, ["backup", "--json", "--out", join(tempHome("mental-empty-out-"), "archive")]);
  assert.equal(empty.status, 2, empty.stdout);
  assert.match(parseErr(empty).message, /nothing to backup/);
  parseOk(mental(home, root, ["journal", "--json", "--title", "Seed", "--resume", "next"]), "seed");
  const intoStore = mental(home, root, ["backup", "--json", "--out", join(home, ".mental", "nested")]);
  assert.equal(intoStore.status, 2, intoStore.stdout);
  assert.match(parseErr(intoStore).message, /must not write into/);
  const busy = join(tempHome("mental-busy-out-"), "archive");
  mkdirSync(busy, { recursive: true });
  writeFileSync(join(busy, "keep.txt"), "nope\n");
  const nonempty = mental(home, root, ["backup", "--json", "--out", busy]);
  assert.equal(nonempty.status, 2, nonempty.stdout);
  assert.match(parseErr(nonempty).message, /not empty/);
  assert.equal(readFileSync(join(busy, "keep.txt"), "utf8"), "nope\n");
});

test("backup packs both slices without paths or sqlite; restore adopts", () => {
  const homeA = tempHome("mental-a-");
  const pack = join(tempHome("mental-pack-"), "archive");
  const a = initRepo(homeA, { name: "proj-a", origin: "https://github.com/org/alpha.git" });
  const b = initRepo(homeA, { name: "proj-b", origin: "https://github.com/org/beta.git" });
  const idA = parseOk(mental(homeA, a.root, ["journal", "--json", "--title", "RestoreSearchNeedle", "--resume", "next"])).id;
  const idB = parseOk(mental(homeA, b.root, ["journal", "--json", "--title", "B-hop-1", "--resume", "next"])).id;
  assert.notEqual(idA, idB);
  writeFileSync(join(homeA, ".mental", "projects", idA, TIME_DB), "not-a-real-db");
  writeFileSync(join(homeA, ".mental", "config.json"), "{}\n");
  writeClashJournal(join(homeA, ".mental"), "09:00 — Personal", "personal-body");
  writeAttention(
    join(homeA, ".mental", "projects", idA),
    "packed-attention",
    "Packed attention",
    "attn-body",
    "2026-09-21T11:00:00.000Z",
  );
  writeNote(
    join(homeA, ".mental", "projects", idA),
    "packed-note",
    "Packed note",
    "note-body",
    "2026-09-21T11:00:00.000Z",
  );

  const packed = parseOk(mental(homeA, a.root, ["backup", "--json", "--out", pack]), "backup");
  assert.equal(packed.slices.length, 2);
  assert.equal(packed.personal, true);
  const manifest = JSON.parse(readFileSync(join(pack, "backup.json"), "utf8"));
  assert.equal(manifest.version, 1);
  for (const s of manifest.slices) {
    assert.ok(Array.isArray(s.origins));
    assert.equal(s.paths, undefined);
  }
  const dump = JSON.stringify(manifest);
  assert.doesNotMatch(dump, new RegExp(escapeRegExp(homeA)));
  assert.equal(existsSync(join(pack, "status")), false);
  const packedFiles = walkNames(pack);
  assert.ok(!packedFiles.includes(TIME_DB));
  assert.ok(!packedFiles.includes("config.json"));
  assert.ok(!packedFiles.includes("bindings.json"));

  const again = parseOk(mental(homeA, a.root, ["backup", "--json", "--out", pack]), "overwrite");
  assert.equal(again.slices.length, 2);

  const homeB = tempHome("mental-b-");
  const clone = initRepo(homeB, { name: "alpha-clone", origin: "https://github.com/org/alpha.git" });
  const unbound = parseOk(mental(homeB, clone.root, ["where", "--json"]), "unbound");
  assert.equal(unbound.id, null);
  const restored = parseOk(mental(homeB, homeB, ["restore", "--json", "--from", pack]), "restore");
  assert.ok(restored.slices.every((s) => s.action === "adopted"));
  assert.equal(restored.personal.action, "merged");
  const dest = loadBindings(homeB);
  assert.equal(dest.bindings.length, 2);
  assert.ok(dest.bindings.every((x) => Array.isArray(x.paths) && x.paths.length === 0));
  const where = parseOk(mental(homeB, clone.root, ["where", "--json"]), "where");
  assert.equal(where.id, idA);
  const found = parseOk(mental(homeB, clone.root, ["search", "RestoreSearchNeedle", "--json"]), "search");
  assert.ok(found.total >= 1, JSON.stringify(found));
  assert.match(readFileSync(join(homeB, ".mental", "journal", "2026-09-21.md"), "utf8"), /personal-body/);
  assert.match(readFileSync(join(homeB, ".mental", "projects", idA, "attention", "packed-attention.md"), "utf8"), /attn-body/);
  assert.match(readFileSync(join(homeB, ".mental", "projects", idA, "notes", "packed-note.md"), "utf8"), /note-body/);
});

test("dest-ahead hop survives an older backup; pack-ahead hop lands", () => {
  const homeA = tempHome("mental-a2-");
  const pack1 = join(tempHome("mental-p1-"), "archive");
  const pack2 = join(tempHome("mental-p2-"), "archive");
  const a = initRepo(homeA, { name: "proj-a", origin: "https://github.com/org/alpha2.git" });
  const b = initRepo(homeA, { name: "proj-b", origin: "https://github.com/org/beta2.git" });
  parseOk(mental(homeA, a.root, ["journal", "--json", "--title", "A-hop-1", "--resume", "next"]));
  parseOk(mental(homeA, b.root, ["journal", "--json", "--title", "B-hop-1", "--resume", "next"]));
  parseOk(mental(homeA, a.root, ["backup", "--json", "--out", pack1]), "pack1");

  const homeB = tempHome("mental-b2-");
  parseOk(mental(homeB, homeB, ["restore", "--json", "--from", pack1]));
  const bClone = initRepo(homeB, { name: "beta-clone", origin: "https://github.com/org/beta2.git" });
  const idB = parseOk(mental(homeB, bClone.root, ["journal", "--json", "--title", "B-hop-2", "--resume", "next"])).id;
  parseOk(mental(homeB, homeB, ["restore", "--json", "--from", pack1]), "restore-old");
  const afterOld = firstJournalText(homeB, idB);
  assert.match(afterOld, /B-hop-2/);
  assert.match(afterOld, /B-hop-1/);

  parseOk(mental(homeA, a.root, ["journal", "--json", "--title", "A-hop-2", "--resume", "next"]));
  parseOk(mental(homeA, a.root, ["backup", "--json", "--out", pack2]), "pack2");
  parseOk(mental(homeB, homeB, ["restore", "--json", "--from", pack2]), "pack-ahead");
  const idA = parseOk(
    mental(homeB, initRepo(homeB, { name: "alpha-clone", origin: "https://github.com/org/alpha2.git" }).root, [
      "where",
      "--json",
    ]),
  ).id;
  assert.match(firstJournalText(homeB, idA), /A-hop-2/);
  assert.match(firstJournalText(homeB, idB), /B-hop-2/);
});

test("same heading different body keeps dest and appends (from backup); second restore is idempotent", () => {
  const homeA = tempHome("mental-clash-a-");
  const repo = initRepo(homeA, { name: "clash", origin: "https://github.com/org/clash.git" });
  const id = parseOk(mental(homeA, repo.root, ["status", "--json"])).id;
  writeClashJournal(join(homeA, ".mental", "projects", id), "14:00 — Clash", "pack-body");
  const pack = join(tempHome("mental-clash-pack-"), "archive");
  parseOk(mental(homeA, repo.root, ["backup", "--json", "--out", pack]));

  const homeB = tempHome("mental-clash-b-");
  parseOk(mental(homeB, homeB, ["restore", "--json", "--from", pack]));
  writeClashJournal(join(homeB, ".mental", "projects", id), "14:00 — Clash", "dest-body");
  parseOk(mental(homeB, homeB, ["restore", "--json", "--from", pack]), "merge-clash");
  const file = join(homeB, ".mental", "projects", id, "journal", "2026-09-21.md");
  let text = readFileSync(file, "utf8");
  assert.match(text, /## 14:00 — Clash\ndest-body/);
  assert.match(text, /\(from backup\)/);
  assert.match(text, /pack-body/);
  assert.equal(hopCount(file), 2);
  parseOk(mental(homeB, homeB, ["restore", "--json", "--from", pack]), "idempotent");
  text = readFileSync(file, "utf8");
  assert.equal(hopCount(file), 2);
});

test("decision LWW: dest-newer kept, pack-newer overwrites", () => {
  const homeA = tempHome("mental-lww-a-");
  const repo = initRepo(homeA, { name: "lww", origin: "https://github.com/org/lww.git" });
  const id = parseOk(mental(homeA, repo.root, ["status", "--json"])).id;
  const sliceA = join(homeA, ".mental", "projects", id);
  writeDecision(sliceA, "keep-dest", "Keep dest", "pack-old", "2026-09-20T10:00:00.000Z");
  writeDecision(sliceA, "take-pack", "Take pack", "pack-new", "2026-09-21T20:00:00.000Z");
  writeAttention(sliceA, "keep-attn", "Keep attn", "pack-attn-old", "2026-09-20T10:00:00.000Z");
  const pack = join(tempHome("mental-lww-p-"), "archive");
  parseOk(mental(homeA, repo.root, ["backup", "--json", "--out", pack]));

  const homeB = tempHome("mental-lww-b-");
  parseOk(mental(homeB, homeB, ["restore", "--json", "--from", pack]));
  const sliceB = join(homeB, ".mental", "projects", id);
  writeDecision(sliceB, "keep-dest", "Keep dest", "dest-newer", "2026-09-21T12:00:00.000Z");
  writeDecision(sliceB, "take-pack", "Take pack", "dest-older", "2026-09-20T12:00:00.000Z");
  writeAttention(sliceB, "keep-attn", "Keep attn", "dest-attn-newer", "2026-09-21T12:00:00.000Z");
  parseOk(mental(homeB, homeB, ["restore", "--json", "--from", pack]), "lww");
  assert.match(readFileSync(join(sliceB, "decisions", "keep-dest.md"), "utf8"), /dest-newer/);
  assert.match(readFileSync(join(sliceB, "decisions", "take-pack.md"), "utf8"), /pack-new/);
  assert.match(readFileSync(join(sliceB, "attention", "keep-attn.md"), "utf8"), /dest-attn-newer/);
});

test("ambiguous origin skips that slice and still restores others", () => {
  const homeA = tempHome("mental-amb-a-");
  const pack = join(tempHome("mental-amb-p-"), "archive");
  const a = initRepo(homeA, { name: "alpha", origin: "https://github.com/org/amb-a.git" });
  const b = initRepo(homeA, { name: "beta", origin: "https://github.com/org/amb-b.git" });
  const packedA = parseOk(mental(homeA, a.root, ["journal", "--json", "--title", "Packed-A", "--resume", "next"])).id;
  parseOk(mental(homeA, b.root, ["journal", "--json", "--title", "Packed-B", "--resume", "next"]));
  parseOk(mental(homeA, a.root, ["backup", "--json", "--out", pack]));

  const homeB = tempHome("mental-amb-b-");
  const localA = initRepo(homeB, { name: "alpha", origin: "https://github.com/org/amb-a.git" });
  const destA = parseOk(mental(homeB, localA.root, ["journal", "--json", "--title", "Dest-A", "--resume", "next"])).id;
  assert.notEqual(destA, packedA);
  const report = parseOk(mental(homeB, homeB, ["restore", "--json", "--from", pack]), "partial");
  const amb = report.slices.find((s) => s.id === packedA);
  assert.equal(amb.action, "skipped-ambiguous");
  assert.equal(amb.destId, destA);
  assert.ok(report.slices.some((s) => s.action === "adopted"));
  assert.match(firstJournalText(homeB, destA), /Dest-A/);
  assert.ok(existsSync(join(homeB, ".mental", "projects", packedA)));
  const dest = loadBindings(homeB);
  assert.ok(dest.bindings.some((x) => x.id === packedA));
  assert.ok(dest.bindings.some((x) => x.id === destA));
  assert.equal(parseOk(mental(homeB, localA.root, ["where", "--json"])).id, destA);
});

test("replace without confirm is usage; with confirm wipes packed uuid only", () => {
  const homeA = tempHome("mental-rep-a-");
  const pack = join(tempHome("mental-rep-p-"), "archive");
  const a = initRepo(homeA, { name: "keep", origin: "https://github.com/org/rep-a.git" });
  parseOk(mental(homeA, a.root, ["journal", "--json", "--title", "Packed", "--resume", "next"]));
  parseOk(mental(homeA, a.root, ["backup", "--json", "--out", pack]));

  const homeB = tempHome("mental-rep-b-");
  parseOk(mental(homeB, homeB, ["restore", "--json", "--from", pack]));
  const clone = initRepo(homeB, { name: "keep", origin: "https://github.com/org/rep-a.git" });
  const packedId = parseOk(
    mental(homeB, clone.root, ["journal", "--json", "--title", "Dest-ahead", "--resume", "next"]),
  ).id;
  const extra = initRepo(homeB, { name: "extra", origin: "https://github.com/org/rep-extra.git" });
  const extraId = parseOk(mental(homeB, extra.root, ["journal", "--json", "--title", "Dest-only", "--resume", "next"])).id;
  writeFileSync(join(homeB, ".mental", "projects", packedId, TIME_DB), "dest-hours");

  const noFrom = mental(homeB, homeB, ["restore", "--json"]);
  assert.equal(noFrom.status, 2);
  assert.equal(parseErr(noFrom).code, "usage");

  const noConfirm = mental(homeB, homeB, ["restore", "--json", "--from", pack, "--replace"]);
  assert.equal(noConfirm.status, 2);
  assert.match(firstJournalText(homeB, packedId), /Dest-ahead/);

  parseOk(mental(homeB, homeB, ["restore", "--json", "--from", pack, "--replace", "--confirm", "REPLACE"]), "replace");
  assert.doesNotMatch(firstJournalText(homeB, packedId), /Dest-ahead/);
  assert.match(firstJournalText(homeB, extraId), /Dest-only/);
  assert.equal(readFileSync(join(homeB, ".mental", "projects", packedId, TIME_DB), "utf8"), "dest-hours");
});

test("doctor on a clean home has no bindings-conflict warning", () => {
  const home = tempHome("mental-doc-clean-");
  const { root } = initRepo(home);
  parseOk(mental(home, root, ["status", "--json"]));
  const doc = JSON.parse(mental(home, root, ["doctor", "--json"]).stdout);
  const hit = (doc.data?.checks || []).find((c) => c.id === "bindings-conflict");
  assert.equal(hit, undefined);
});

test("doctor warns on bindings conflict copies", () => {
  const home = tempHome("mental-doc-");
  const { root } = initRepo(home);
  parseOk(mental(home, root, ["status", "--json"]));
  writeFileSync(join(home, ".mental", "bindings.json.sync-conflict-1"), "{}\n");
  const doc = JSON.parse(mental(home, root, ["doctor", "--json"]).stdout);
  const hit = (doc.data?.checks || []).find((c) => c.id === "bindings-conflict");
  assert.ok(hit, JSON.stringify(doc.data, null, 2));
  assert.equal(hit.ok, false);
  assert.equal(hit.level, "warn");
  assert.match(hit.message, /backup/);
});

test("snapshotLiveMental refuses dest outside tmpdir", () => {
  assert.throws(() => snapshotLiveMental(homedir()), /os\.tmpdir/);
});

test(
  "live ~/.mental snapshot backup/restore does not mutate the real store",
  { skip: !existsSync(join(homedir(), ".mental", "bindings.json")) },
  () => {
    const live = liveMentalDir();
    const before = fingerprintMental(live);
    const homeA = tempHome("mental-live-a-");
    const shot = snapshotLiveMental(homeA);
    assert.equal(shot.skipped, false);
    assert.deepEqual(fingerprintMental(live), before);
    const pack = join(tempHome("mental-live-p-"), "archive");
    const packed = parseOk(mental(homeA, homeA, ["backup", "--json", "--out", pack]), "live-backup");
    assert.ok(packed.slices.length >= 1 || packed.personal);
    const manifest = readFileSync(join(pack, "backup.json"), "utf8");
    assert.doesNotMatch(manifest, /legacyImportedFrom/);
    const homeB = tempHome("mental-live-b-");
    const restored = parseOk(mental(homeB, homeB, ["restore", "--json", "--from", pack]), "live-restore");
    assert.equal(loadBindings(homeB).bindings.length, packed.slices.length);
    assert.equal(restored.slices.length, packed.slices.length);
    assert.deepEqual(fingerprintMental(live), before);
  },
);

test("fingerprintMental okfHash changes when journal bytes change", () => {
  const home = tempHome("mental-fp-");
  const repo = initRepo(home);
  parseOk(mental(home, repo.root, ["journal", "--json", "--title", "Fp-1", "--resume", "next"]));
  const a = fingerprintMental(join(home, ".mental"));
  parseOk(mental(home, repo.root, ["journal", "--json", "--title", "Fp-2", "--resume", "next"]));
  const b = fingerprintMental(join(home, ".mental"));
  assert.notEqual(b.okfHash, a.okfHash);
  assert.equal(b.bindingsHash, a.bindingsHash);
});

test("restore refuses missing, corrupt, or unsupported backup.json without mutating dest", () => {
  const home = tempHome("mental-bad-from-");
  const repo = initRepo(home, { name: "dest", origin: "https://github.com/org/bad-from.git" });
  parseOk(mental(home, repo.root, ["journal", "--json", "--title", "Keep-me", "--resume", "next"]));
  const before = fingerprintMental(join(home, ".mental"));

  const missing = mental(home, home, ["restore", "--json", "--from", join(tempHome("mental-no-pack-"), "archive")]);
  assert.equal(missing.status, 2, missing.stdout);
  assert.match(parseErr(missing).message, /not a Mental backup/);

  const pack = join(tempHome("mental-bad-pack-"), "archive");
  mkdirSync(pack, { recursive: true });
  writeFileSync(join(pack, "backup.json"), "{not json");
  const corrupt = mental(home, home, ["restore", "--json", "--from", pack]);
  assert.equal(corrupt.status, 2, corrupt.stdout);
  assert.match(parseErr(corrupt).message, /corrupt/);

  writeFileSync(join(pack, "backup.json"), JSON.stringify({ version: 99, slices: [] }));
  const unsupported = mental(home, home, ["restore", "--json", "--from", pack]);
  assert.equal(unsupported.status, 2, unsupported.stdout);
  assert.match(parseErr(unsupported).message, /unsupported backup version/);

  assert.deepEqual(fingerprintMental(join(home, ".mental")), before);
});

test("restore refuses a non-uuid slice id before writing", () => {
  const home = tempHome("mental-pwn-");
  const repo = initRepo(home, { name: "dest", origin: "https://github.com/org/pwn.git" });
  parseOk(mental(home, repo.root, ["journal", "--json", "--title", "Keep-me", "--resume", "next"]));
  const before = fingerprintMental(join(home, ".mental"));
  const pack = join(tempHome("mental-pwn-pack-"), "archive");
  mkdirSync(pack, { recursive: true });
  writeFileSync(
    join(pack, "backup.json"),
    JSON.stringify({ version: 1, slices: [{ id: "../pwned", name: "pwn", origins: [] }], personal: false }),
  );
  const bad = mental(home, home, ["restore", "--json", "--from", pack]);
  assert.equal(bad.status, 2, bad.stdout);
  assert.match(parseErr(bad).message, /invalid slice id/);
  assert.deepEqual(fingerprintMental(join(home, ".mental")), before);
  assert.equal(existsSync(join(home, ".mental", "pwned")), false);
  assert.equal(existsSync(join(home, "pwned")), false);
});

test("backup skips non-uuid binding ids", () => {
  const home = tempHome("mental-pack-pwn-");
  const repo = initRepo(home, { name: "ok", origin: "https://github.com/org/ok.git" });
  const id = parseOk(mental(home, repo.root, ["journal", "--json", "--title", "Ok", "--resume", "next"])).id;
  const data = loadBindings(home);
  data.bindings.push({
    id: "../pwned",
    name: "bad",
    origins: [],
    paths: [],
    updatedAt: "2026-09-21T00:00:00.000Z",
  });
  saveBindings(home, data);
  const pack = join(tempHome("mental-pack-pwn-out-"), "archive");
  const packed = parseOk(mental(home, repo.root, ["backup", "--json", "--out", pack]));
  assert.equal(packed.slices.length, 1);
  assert.equal(packed.slices[0].id, id);
  assert.equal(existsSync(join(pack, "pwned")), false);
});

test("personal dest-ahead hop survives; replace wipes packed personal OKF not dest sqlite", () => {
  const homeA = tempHome("mental-per-a-");
  const repo = initRepo(homeA, { name: "per", origin: "https://github.com/org/per.git" });
  parseOk(mental(homeA, repo.root, ["journal", "--json", "--title", "Packed-proj", "--resume", "next"]));
  writeClashJournal(join(homeA, ".mental"), "09:00 — Personal pack", "pack-personal");
  const pack = join(tempHome("mental-per-p-"), "archive");
  parseOk(mental(homeA, repo.root, ["backup", "--json", "--out", pack]));

  const homeB = tempHome("mental-per-b-");
  parseOk(mental(homeB, homeB, ["restore", "--json", "--from", pack]));
  writeClashJournal(join(homeB, ".mental"), "09:00 — Personal pack", "dest-personal");
  writeClashJournal(join(homeB, ".mental"), "10:00 — Dest only", "dest-only-hop", "2026-09-22");
  writeFileSync(join(homeB, ".mental", TIME_DB), "dest-sqlite");
  parseOk(mental(homeB, homeB, ["restore", "--json", "--from", pack]), "personal-merge");
  const j21 = readFileSync(join(homeB, ".mental", "journal", "2026-09-21.md"), "utf8");
  assert.match(j21, /dest-personal/);
  assert.match(j21, /\(from backup\)/);
  assert.match(readFileSync(join(homeB, ".mental", "journal", "2026-09-22.md"), "utf8"), /dest-only-hop/);

  parseOk(
    mental(homeB, homeB, ["restore", "--json", "--from", pack, "--replace", "--confirm", "REPLACE"]),
    "personal-replace",
  );
  const afterReplace = readFileSync(join(homeB, ".mental", "journal", "2026-09-21.md"), "utf8");
  assert.match(afterReplace, /pack-personal/);
  assert.doesNotMatch(afterReplace, /dest-personal/);
  assert.equal(existsSync(join(homeB, ".mental", "journal", "2026-09-22.md")), false);
  assert.equal(readFileSync(join(homeB, ".mental", TIME_DB), "utf8"), "dest-sqlite");
});

test("replace on skipped-ambiguous leaves dest uuid journal intact", () => {
  const homeA = tempHome("mental-amb-rep-a-");
  const pack = join(tempHome("mental-amb-rep-p-"), "archive");
  const a = initRepo(homeA, { name: "alpha", origin: "https://github.com/org/amb-rep-a.git" });
  const packedA = parseOk(mental(homeA, a.root, ["journal", "--json", "--title", "Packed-A", "--resume", "next"])).id;
  parseOk(mental(homeA, a.root, ["backup", "--json", "--out", pack]));

  const homeB = tempHome("mental-amb-rep-b-");
  const localA = initRepo(homeB, { name: "alpha", origin: "https://github.com/org/amb-rep-a.git" });
  const destA = parseOk(mental(homeB, localA.root, ["journal", "--json", "--title", "Dest-A", "--resume", "next"])).id;
  assert.notEqual(destA, packedA);
  parseOk(
    mental(homeB, homeB, ["restore", "--json", "--from", pack, "--replace", "--confirm", "REPLACE"]),
    "replace-ambiguous",
  );
  assert.match(firstJournalText(homeB, destA), /Dest-A/);
  assert.equal(parseOk(mental(homeB, localA.root, ["where", "--json"])).id, destA);
});
