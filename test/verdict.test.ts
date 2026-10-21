import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, exitCode } from "../src/verdict.js";
import { validateTable } from "../src/fixes.js";
import type { Declaration, Finding } from "../src/types.js";
import { decl, table } from "./helpers.js";

const pending = table("pending");
const hypo = table("hypothetical");
const below = table("below-declared");

function check(d: Declaration, t = hypo): [string, string] {
  const r = classify(d, t);
  return [r.bucket, r.reason];
}

test("exact official tag or .tool-versions on an EOL branch: ACTION REQUIRED eol", () => {
  assert.deepEqual(check(decl("official-image", "8.1.31")), ["action", "eol"]);
  assert.deepEqual(check(decl("tool-versions", "7.4.33")), ["action", "eol"]);
});

test("exact below a known fix: ACTION REQUIRED vulnerable, names the fix", () => {
  const r = classify(decl("official-image", "8.3.30"), hypo);
  assert.deepEqual([r.bucket, r.reason], ["action", "vulnerable"]);
  assert.match(r.message, /8\.3\.99/);
});

test("exact at or above a known fix: DECLARED >= FIXED, runtime not verified", () => {
  const r = classify(decl("official-image", "8.3.99"), hypo);
  assert.deepEqual([r.bucket, r.reason], ["fixed", "declared-fixed"]);
  assert.match(r.message, /runtime not verified/);
});

test("exact on a branch marked not affected: DECLARED >= FIXED not-affected", () => {
  const t = { ...pending, branches: { ...pending.branches, "8.2": { fixed: null, affected: false as const } } };
  assert.deepEqual(check(decl("official-image", "8.2.30"), t), ["fixed", "not-affected"]);
});

test("exact while the branch fix is still null: CHECK MANUALLY pending-fix", () => {
  assert.deepEqual(check(decl("official-image", "8.3.30"), pending), ["manual", "pending-fix"]);
  assert.deepEqual(check(decl("tool-versions", "8.4.20"), pending), ["manual", "pending-fix"]);
});

test("unknown branches, pre-releases and dev builds: CHECK MANUALLY unknown-branch", () => {
  for (const v of ["8.6.0", "9.0.1", "8.6.0RC3", "nightly", "master"]) {
    assert.deepEqual(check(decl("official-image", v)), ["manual", "unknown-branch"], v);
  }
  assert.deepEqual(check(decl("setup-php", "nightly")), ["manual", "unknown-branch"]);
});

test("floating official tags on a supported branch: CHECK MANUALLY floating-rebuild", () => {
  for (const v of ["8.3", "8", "fpm", "latest", "cli", ""]) {
    const r = classify(decl("official-image", v), hypo);
    assert.deepEqual([r.bucket, r.reason], ["manual", "floating-rebuild"], v);
    assert.match(r.message, /docker run/);
  }
  const old = classify(decl("official-image", "8.3", { note: "bullseye" }), hypo);
  assert.match(old.message, /old base OS/);
});

test(".php-version (exact or minor) and minor-only .tool-versions: CHECK MANUALLY floating-rebuild", () => {
  assert.deepEqual(check(decl("php-version-file", "8.3.99")), ["manual", "floating-rebuild"]);
  assert.deepEqual(check(decl("php-version-file", "8.3")), ["manual", "floating-rebuild"]);
  assert.deepEqual(check(decl("tool-versions", "8.3")), ["manual", "floating-rebuild"]);
});

test("any setup-php value on a supported branch: CHECK MANUALLY floating-rebuild", () => {
  for (const v of ["8.3.99", "8.3", "8.x", "latest"]) {
    assert.deepEqual(check(decl("setup-php", v, { context: "ci" })), ["manual", "floating-rebuild"], v);
  }
});

test("floating, minor-only, .php-version or setup-php on an EOL branch: ACTION REQUIRED eol", () => {
  assert.deepEqual(check(decl("official-image", "7.4")), ["action", "eol"]);
  assert.deepEqual(check(decl("official-image", "8.1")), ["action", "eol"]);
  assert.deepEqual(check(decl("php-version-file", "8.0")), ["action", "eol"]);
  assert.deepEqual(check(decl("setup-php", "7.4")), ["action", "eol"]);
});

test("build-arg defaults stay CHECK MANUALLY, and say so when the default is EOL", () => {
  assert.deepEqual(check(decl("build-arg", "8.3.99")), ["manual", "build-arg"]);
  const r = classify(decl("build-arg", "7.4"), hypo);
  assert.deepEqual([r.bucket, r.reason], ["manual", "build-arg"]);
  assert.match(r.message, /end of life/);
});

test("unresolved, digest, third-party, distro, Sail and composer rows", () => {
  assert.deepEqual(check(decl("unresolved", null)), ["manual", "unresolved"]);
  assert.deepEqual(check(decl("digest", null)), ["manual", "digest"]);
  assert.deepEqual(check(decl("third-party-image", "8.2")), ["manual", "third-party-image"]);
  assert.match(classify(decl("third-party-image", "7.4"), hypo).message, /end of life/);
  assert.deepEqual(check(decl("distro", "8.2")), ["manual", "distro-vendor"]);
  assert.deepEqual(check(decl("distro", "7.4")), ["manual", "distro-vendor"]);
  assert.deepEqual(check(decl("distro", null)), ["manual", "distro-vendor"]);
  assert.deepEqual(check(decl("sail", "8.4")), ["manual", "distro-vendor"]);
  assert.deepEqual(check(decl("composer", "^8.3.99")), ["manual", "constraint-only"]);
  assert.deepEqual(check(decl("composer", ">=7.4")), ["manual", "constraint-only"]);
});

test("pending table never yields DECLARED >= FIXED", () => {
  for (const v of ["8.2.99", "8.3.99", "8.4.99", "8.5.99"]) {
    assert.notEqual(classify(decl("official-image", v), pending).bucket, "fixed");
  }
});

test("no unprovable source ever lands in DECLARED >= FIXED (below-declared table)", () => {
  assert.deepEqual(validateTable(below), [], "below-declared table must validate first");
  const unprovable: Declaration[] = [];
  for (const b of ["8.2", "8.3", "8.4", "8.5"]) {
    const v = `${b}.98`;
    unprovable.push(
      decl("official-image", b),
      decl("official-image", `${b}-fpm`.split("-")[0]!),
      decl("php-version-file", v),
      decl("tool-versions", b),
      decl("setup-php", v, { context: "ci" }),
      decl("build-arg", v),
      decl("digest", v),
      decl("third-party-image", v),
      decl("distro", b),
      decl("sail", b),
      decl("composer", `^${v}`),
      decl("unresolved", null),
    );
  }
  for (const d of unprovable) {
    assert.notEqual(classify(d, below).bucket, "fixed", `${d.kind} ${d.version}`);
  }
  // The exact pins above the fix do land there, which shows the table is in effect.
  assert.equal(classify(decl("official-image", "8.3.98"), below).bucket, "fixed");
});

function finding(bucket: Finding["bucket"], reason: Finding["reason"], extra: Partial<Finding> = {}): Finding {
  return { ...decl("official-image", "8.3.99"), bucket, reason, branch: "8.3", message: "", ...extra };
}

test("exit codes", () => {
  assert.equal(exitCode([], 0).code, 4);
  assert.equal(exitCode([], 2).code, 4);
  assert.equal(exitCode([finding("action", "eol"), finding("manual", "floating-rebuild")], 0).code, 1);
  assert.equal(exitCode([finding("manual", "floating-rebuild")], 0).code, 3);
  assert.equal(exitCode([finding("fixed", "declared-fixed")], 1).code, 3);
  const composer = finding("manual", "constraint-only", { kind: "composer" });
  assert.equal(exitCode([finding("fixed", "declared-fixed"), composer], 0).code, 0);
  assert.equal(exitCode([composer], 0).code, 3);
  const devPin = finding("fixed", "declared-fixed", { kind: "tool-versions", context: "dev" });
  const r = exitCode([devPin, composer], 0);
  assert.equal(r.code, 3);
  assert.match(r.why, /no production runtime/);
  assert.equal(exitCode([devPin], 0).code, 3);
});

test("every reason code has a fix string", async () => {
  const { REASONS } = await import("../src/types.js");
  const { FIX_GUIDE } = await import("../src/fixes-guide.js");
  for (const r of REASONS) assert.ok(FIX_GUIDE[r] && FIX_GUIDE[r].length > 20, r);
  assert.deepEqual(Object.keys(FIX_GUIDE).sort(), [...REASONS].sort());
  for (const t of Object.values(FIX_GUIDE)) assert.doesNotMatch(t, /\bsafe\b|auto-?remediat/i);
});
