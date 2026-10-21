import { test } from "node:test";
import assert from "node:assert/strict";
import { branchOf, compareExact, isEol, parseVersion } from "../src/version.js";

const p = (s: string) => {
  const v = parseVersion(s);
  assert.ok(v, `parse ${s}`);
  return v;
};

test("parses exact, minor-only, major-only and wildcard versions", () => {
  assert.deepEqual(
    [p("8.3.30"), p("8.3"), p("8"), p("8.x"), p("8.3.x")].map((v) => [v.major, v.minor, v.patch]),
    [[8, 3, 30], [8, 3, null], [8, null, null], [8, null, null], [8, 3, null]],
  );
  assert.equal(parseVersion("latest"), null);
  assert.equal(parseVersion("^8.2"), null);
});

test("compares patch numbers numerically", () => {
  assert.ok(compareExact(p("8.3.9"), p("8.3.10")) < 0);
  assert.ok(compareExact(p("8.3.10"), p("8.3.9")) > 0);
  assert.equal(compareExact(p("8.4.1"), p("8.4.1")), 0);
});

test("recognises pre-release suffixes", () => {
  assert.equal(p("8.5.0RC1").pre, "RC1");
  assert.equal(p("8.5.0-rc1").pre, "RC1");
  assert.equal(p("8.5.0beta2").pre, "BETA2");
  assert.equal(p("8.3.30").pre, null);
});

test("extracts branches", () => {
  assert.equal(branchOf(p("8.3.30")), "8.3");
  assert.equal(branchOf(p("8")), null);
});

test("EOL detection uses majors and branches from the table list", () => {
  const eol = ["5", "7", "8.0", "8.1"];
  for (const s of ["5.6.40", "7.4", "7", "8.0.30", "8.1"]) assert.ok(isEol(p(s), eol), s);
  for (const s of ["8.2.34", "8.3", "8.5.11", "8", "9.0"]) assert.ok(!isEol(p(s), eol), s);
});
