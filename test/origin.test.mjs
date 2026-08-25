import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeOrigin } from "../bin/lib/git.mjs";

test("SSH and HTTPS origins normalize to the same host/path", () => {
  const https = normalizeOrigin("https://github.com/afaraha8403/mental.git");
  const ssh = normalizeOrigin("git@github.com:afaraha8403/mental.git");
  const sshUrl = normalizeOrigin("ssh://git@github.com/afaraha8403/mental.git");
  assert.equal(https, "github.com/afaraha8403/mental");
  assert.equal(ssh, https);
  assert.equal(sshUrl, https);
});

test("strips userinfo, trailing slash, and lowercases host", () => {
  assert.equal(
    normalizeOrigin("https://token:x@GitHub.COM/afaraha8403/mental.git/"),
    "github.com/afaraha8403/mental",
  );
});

test("empty / garbage → null", () => {
  assert.equal(normalizeOrigin(""), null);
  assert.equal(normalizeOrigin(null), null);
  assert.equal(normalizeOrigin("   "), null);
});

test("already-canonical host/path round-trips", () => {
  assert.equal(normalizeOrigin("github.com/org/repo"), "github.com/org/repo");
});
