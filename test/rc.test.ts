import { test } from "node:test";
import assert from "node:assert/strict";
import { compareExact, parseVersion } from "../src/version.js";
import { validateTable } from "../src/fixes.js";
import { classify } from "../src/verdict.js";
import { detectDockerfile } from "../src/detectors/docker.js";
import { detectYaml } from "../src/detectors/yaml.js";
import type { FixTable } from "../src/types.js";
import { decl, table } from "./helpers.js";

const v = (s: string) => parseVersion(s)!;
const lt = (a: string, b: string) => assert.ok(compareExact(v(a), v(b)) < 0, `${a} < ${b}`);

test("pre-releases order against each other and against the final release", () => {
  lt("8.6.0RC3", "8.6.0RC4");
  lt("8.6.0RC4", "8.6.0");
  lt("8.6.0RC9", "8.6.0RC10");
  lt("8.6.0beta3", "8.6.0RC1");
  lt("8.6.0alpha1", "8.6.0beta1");
  lt("8.6.0", "8.6.1");
  lt("8.5.12", "8.6.0RC1");
  assert.equal(compareExact(v("8.6.0RC4"), v("8.6.0rc4")), 0);
  assert.equal(compareExact(v("8.6.0-rc4"), v("8.6.0RC4")), 0);
});

// The hypothetical table plus an 8.6 entry, the way it would be added at release.
function with86(fixed: string | null): FixTable {
  const t = table("hypothetical");
  return { ...t, branches: { ...t.branches, "8.6": { fixed } } };
}

test("an 8.6 RC is a valid fixed version above the 8.6.0RC3 floor; final branches still need final releases", () => {
  assert.deepEqual(validateTable(with86("8.6.0RC4")), []);
  assert.deepEqual(validateTable(with86("8.6.0")), []);
  assert.match(validateTable(with86("8.6.0RC3")).join(), /floor/);
  assert.match(validateTable(with86("8.6.0RC2")).join(), /floor/);
  assert.match(validateTable(with86("8.6.0beta9")).join(), /not an X\.Y\.Z release/);
  const t = table("hypothetical");
  assert.match(validateTable({ ...t, branches: { ...t.branches, "8.5": { fixed: "8.5.99RC1" } } }).join(), /not an X\.Y\.Z release on this branch/);
});

const tags = {
  exactRc: detectDockerfile("Dockerfile", "FROM php:8.6.0RC3-cli\n")[0]!,
  floatingRc: detectDockerfile("Dockerfile", "FROM php:8.6-rc-fpm\n")[0]!,
  rcOnly: detectDockerfile("Dockerfile", "FROM php:rc-cli\n")[0]!,
  setup: detectYaml(".github/workflows/ci.yml", "    steps:\n      - uses: shivammathur/setup-php@v2\n        with:\n          php-version: '8.6'\n")[0]!,
};

test("8.6 RC tags parse as declared", () => {
  assert.deepEqual([tags.exactRc.kind, tags.exactRc.version], ["official-image", "8.6.0rc3"]);
  assert.deepEqual([tags.floatingRc.kind, tags.floatingRc.version], ["official-image", "8.6-rc"]);
  assert.deepEqual([tags.rcOnly.kind, tags.rcOnly.version], ["official-image", "rc-cli"]);
  assert.deepEqual([tags.setup.kind, tags.setup.version], ["setup-php", "8.6"]);
});

const verdict = (d: Parameters<typeof classify>[0], t: FixTable) => {
  const r = classify(d, t);
  return `${r.bucket}/${r.reason}`;
};

test("without an 8.6 entry, every 8.6 declaration is CHECK MANUALLY unknown-branch", () => {
  const t = table("hypothetical");
  for (const d of [tags.exactRc, tags.floatingRc, tags.rcOnly, tags.setup, decl("official-image", "8.6.0"), decl("tool-versions", "8.6.0RC3")]) {
    assert.equal(verdict(d, t), "manual/unknown-branch", `${d.kind} ${d.version}`);
  }
});

test("with an 8.6 entry fixed in 8.6.0RC4, RC pins are compared and floating ones stay manual", () => {
  const t = with86("8.6.0RC4");
  assert.equal(verdict(tags.exactRc, t), "action/vulnerable");
  assert.match(classify(tags.exactRc, t).message, /8\.6\.0RC4/);
  assert.equal(verdict(decl("official-image", "8.6.0RC4"), t), "fixed/declared-fixed");
  assert.equal(verdict(decl("official-image", "8.6.0"), t), "fixed/declared-fixed");
  assert.equal(verdict(decl("tool-versions", "8.6.0RC3"), t), "action/vulnerable");
  assert.equal(verdict(tags.floatingRc, t), "manual/floating-rebuild");
  assert.equal(verdict(tags.setup, t), "manual/floating-rebuild");
  assert.equal(verdict(decl("setup-php", "8.6.0RC4", { context: "ci" }), t), "manual/floating-rebuild");
  assert.equal(verdict(tags.rcOnly, t), "manual/unknown-branch", "php:rc-cli follows whatever RC is newest");
});

test("with an 8.6 entry but no fixed version, an exact RC pin is pending-fix", () => {
  const t = table("pending");
  const p = { ...t, branches: { ...t.branches, "8.6": { fixed: null } } };
  assert.deepEqual(validateTable(p), []);
  assert.equal(verdict(tags.exactRc, p), "manual/pending-fix");
});
