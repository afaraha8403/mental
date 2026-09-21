import { test } from "node:test";
import assert from "node:assert/strict";
import { renderFrontmatter, renderMarkdown } from "../assets/dashboard/markdown.js";
import { CLUSTER, HUB_LAYOUT, KIND_COLOR, nodeWeight, toGraphData, toMindMapGraph } from "../assets/dashboard/map-data.js";

test("markdown preview escapes html and renders emphasis and links", () => {
  const html = renderMarkdown("**<script>alert(1)</script>** and [pad](notes/pad.md)");
  assert.match(html, /<strong>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/strong>/);
  assert.match(html, /data-path="notes\/pad.md"/);
  assert.doesNotMatch(renderMarkdown("[x](javascript:alert(1))"), /javascript:/);
  assert.match(renderMarkdown("```\n<b>\n```"), /&lt;b&gt;/);
  const mixed = renderMarkdown("## Options\n- One\n- Two");
  assert.match(mixed, /<h2>Options<\/h2>/);
  assert.match(mixed, /<ul><li>One<\/li><li>Two<\/li><\/ul>/);
});

test("frontmatter renders as text, not raw yaml", () => {
  const html = renderFrontmatter({ type: "Note", title: "A <b>title</b>", tags: ["a"] });
  assert.match(html, /<dt>type<\/dt><dd>Note<\/dd>/);
  assert.match(html, /A &lt;b&gt;title&lt;\/b&gt;/);
});

test("mind map weights hubs and seeds each type in its own cluster", () => {
  assert.equal(nodeWeight(0), 1);
  assert.ok(nodeWeight(3) > nodeWeight(1));
  const data = toGraphData({
    nodes: [
      { path: "decisions/a.md", type: "Decision", title: "A" },
      { path: "notes/b.md", type: "Note", title: "B" },
      { path: "notes/c.md", type: "Note", title: "C <x>" },
    ],
    edges: [
      { from: "decisions/a.md", to: "notes/b.md" },
      { from: "notes/b.md", to: "notes/c.md" },
      { from: "notes/b.md", to: "notes/c.md" },
      { from: "notes/b.md", to: "notes/b.md" },
    ],
  });
  assert.equal(data.links.length, 2);
  const byId = Object.fromEntries(data.nodes.map((node) => [node.id, node]));
  assert.ok(byId["notes/b.md"].weight > byId["decisions/a.md"].weight);
  assert.equal(byId["notes/b.md"].links, 2);
  assert.equal(byId["notes/c.md"].title, "C <x>");
  const decision = byId["decisions/a.md"];
  const note = byId["notes/c.md"];
  assert.ok(Math.abs(decision.x - CLUSTER.Decision.x) < 40);
  assert.ok(Math.abs(note.z - CLUSTER.Note.z) < 40);
  assert.ok(Math.hypot(decision.x - note.x, decision.y - note.y, decision.z - note.z) > 80);
  for (const node of data.nodes) {
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y) && Number.isFinite(node.z));
  }
});

test("toMindMapGraph guarantees wide cluster separation and zero node overlap", () => {
  // Test with large dataset (50 decisions, 30 attention, 15 journals, 5 notes)
  const nodes = [];
  for (let i = 0; i < 50; i++) nodes.push({ path: `decisions/dec-${i}.md`, type: "Decision", title: `Decision Number ${i}` });
  for (let i = 0; i < 30; i++) nodes.push({ path: `attention/att-${i}.md`, type: "Attention", title: `Attention Item ${i}` });
  for (let i = 0; i < 15; i++) nodes.push({ path: `journals/j-${i}.md`, type: "Journal", title: `Journal Entry ${i}` });
  for (let i = 0; i < 5; i++) nodes.push({ path: `notes/n-${i}.md`, type: "Note", title: `Project Note ${i}` });

  const graph = toMindMapGraph({ nodes, edges: [] }, "TestProject");

  // Hubs must be widely separated
  assert.ok(Math.abs(HUB_LAYOUT.Decision.y - HUB_LAYOUT.Note.y) >= 400);
  assert.ok(Math.abs(HUB_LAYOUT.Attention.y - HUB_LAYOUT.Journal.y) >= 400);
  assert.ok(Math.abs(HUB_LAYOUT.Decision.x - HUB_LAYOUT.Attention.x) >= 600);

  // Every single node must have non-overlapping bounding boxes
  const allNodes = graph.allNodes;
  for (let i = 0; i < allNodes.length; i++) {
    const a = allNodes[i];
    const aw = (a.w || 140) / 2;
    const ah = (a.h || 28) / 2;
    for (let j = i + 1; j < allNodes.length; j++) {
      const b = allNodes[j];
      const bw = (b.w || 140) / 2;
      const bh = (b.h || 28) / 2;
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      const overlaps = dx < (aw + bw) && dy < (ah + bh);
      assert.ok(!overlaps, `Node collision detected between ${a.id || a.title} and ${b.id || b.title}: dx=${dx}, dy=${dy}`);
    }
  }
});

test("toMindMapGraph clusters by OKF matter/tags across different document types", () => {
  const nodes = [
    { path: "decisions/track-hours.md", type: "Decision", title: "Track hours interval", tags: ["track"] },
    { path: "attention/track-stale.md", type: "Attention", title: "Last seen stale in track", tags: ["track"] },
    { path: "notes/track-guide.md", type: "Note", title: "Time tracking instructions", tags: ["track"] },
    { path: "decisions/backup-slice.md", type: "Decision", title: "Backup slice format", tags: ["backup"] },
    { path: "attention/backup-conflict.md", type: "Attention", title: "Restore conflicts", tags: ["backup"] },
    { path: "journal/2026-08-30.md", type: "Journal", title: "Work log for 2026-08-30", tags: ["journal"] },
  ];
  const edges = [
    { from: "attention/track-stale.md", to: "decisions/track-hours.md", rel: "against" },
  ];

  const graph = toMindMapGraph({ nodes, edges }, "MentalTest");

  // Track cluster should contain nodes of multiple types (Decision, Attention, Note)
  const trackHub = graph.hubs.find((h) => h.matterId === "track");
  assert.ok(trackHub, "track hub should exist");
  assert.equal(trackHub.count, 3);

  const trackConcepts = graph.concepts.filter((c) => c.matterId === "track");
  assert.equal(trackConcepts.length, 3);
  const typesInTrack = new Set(trackConcepts.map((c) => c.type));
  assert.ok(typesInTrack.has("Decision"));
  assert.ok(typesInTrack.has("Attention"));
  assert.ok(typesInTrack.has("Note"));

  // Node colors must still match their type
  for (const c of trackConcepts) {
    assert.equal(c.color, KIND_COLOR[c.type]);
  }

  // Cross links must exist
  assert.equal(graph.crossLinks.length, 1);
  assert.equal(graph.crossLinks[0].source, "attention/track-stale.md");
  assert.equal(graph.crossLinks[0].target, "decisions/track-hours.md");
});

test("toMindMapGraph supports organic brain layout mode", () => {
  const nodes = [
    { path: "decisions/track-hours.md", type: "Decision", title: "Track hours interval", tags: ["track"] },
    { path: "attention/track-stale.md", type: "Attention", title: "Last seen stale in track", tags: ["track"] },
    { path: "decisions/backup-slice.md", type: "Decision", title: "Backup slice format", tags: ["backup"] },
  ];
  const edges = [
    { from: "attention/track-stale.md", to: "decisions/track-hours.md", rel: "against" },
  ];

  const graph = toMindMapGraph({ nodes, edges }, "MentalTest", null, "organic");
  assert.ok(graph.hubs.length >= 2);
  assert.equal(graph.concepts.length, 3);

  // In organic layout, hubs radiate around root (x, y are non-zero and separated from root)
  for (const h of graph.hubs) {
    assert.ok(Number.isFinite(h.x) && Number.isFinite(h.y));
    assert.ok(Math.hypot(h.x, h.y) > 200);
  }
});
