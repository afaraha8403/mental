import { test } from "node:test";
import assert from "node:assert/strict";
import { renderFrontmatter, renderMarkdown } from "../assets/dashboard/markdown.js";
import { layoutNodes } from "../assets/dashboard/map.js";

test("markdown preview escapes html and renders emphasis and links", () => {
  const html = renderMarkdown("**<script>alert(1)</script>** and [pad](notes/pad.md)");
  assert.match(html, /<strong>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/strong>/);
  assert.match(html, /data-path="notes\/pad.md"/);
  assert.doesNotMatch(renderMarkdown("[x](javascript:alert(1))"), /javascript:/);
  assert.match(renderMarkdown("```\n<b>\n```"), /&lt;b&gt;/);
});

test("frontmatter renders as text, not raw yaml", () => {
  const html = renderFrontmatter({ type: "Note", title: "A <b>title</b>", tags: ["a"] });
  assert.match(html, /<dt>type<\/dt><dd>Note<\/dd>/);
  assert.match(html, /A &lt;b&gt;title&lt;\/b&gt;/);
});

test("mind map layout keeps every node at a finite position", () => {
  const nodes = [{ path: "a" }, { path: "b" }, { path: "c" }];
  const pos = layoutNodes(nodes, [{ from: "a", to: "b" }]);
  assert.equal(pos.size, 3);
  for (const point of pos.values()) {
    assert.ok(Number.isFinite(point.x));
    assert.ok(Number.isFinite(point.y));
    assert.ok(Number.isFinite(point.z));
  }
});
