import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));

test("rc stub prints the not-released notice and exits 2 for any input", () => {
  for (const args of [[], ["."], ["--json", "examples/demo-repo"]]) {
    const r = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /not released yet/);
    assert.doesNotMatch(r.stdout + r.stderr, /\bsafe\b/i);
  }
});
