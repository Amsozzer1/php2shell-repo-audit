import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { FIXTURES, REPO_ROOT } from "./helpers.js";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const demo = `${REPO_ROOT}examples/demo-repo`;

function run(args: string[]) {
  const r = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function counts(args: string[]) {
  const r = run([...args, "--json"]);
  const j = JSON.parse(r.out) as { counts: Record<string, number>; exitCode: number };
  assert.equal(j.exitCode, r.code);
  return [j.counts.actionRequired, j.counts.checkManually, j.counts.declaredFixed, r.code];
}

test("demo repo with the pending table: 1 / 6 / 0, exit 1", () => {
  assert.deepEqual(counts([demo, "--offline", "--fixes", `${FIXTURES}fixes.pending.json`]), [1, 6, 0, 1]);
});

test("demo repo with the hypothetical table: 3 / 4 / 0, exit 1", () => {
  assert.deepEqual(counts([demo, "--offline", "--fixes", `${FIXTURES}fixes.hypothetical.json`]), [3, 4, 0, 1]);
});

test("text output shows all three buckets, the header and the disclaimer", () => {
  const r = run([demo, "--offline", "--fixes", `${FIXTURES}fixes.pending.json`]);
  assert.equal(r.code, 1);
  assert.match(r.out, /fix table rev 1: pending, php.net has not published fixed versions \(file\)/);
  assert.match(r.out, /It does not check running servers/);
  assert.match(r.out, /ACTION REQUIRED \(1\)/);
  assert.match(r.out, /CHECK MANUALLY \(6\)/);
  assert.match(r.out, /DECLARED ≥ FIXED \(0\)/);
});

function tmpRepo(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "p2s-"));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(join(dir, rel, ".."), { recursive: true });
    writeFileSync(join(dir, rel), body);
  }
  return dir;
}

const pending = ["--offline", "--fixes", `${FIXTURES}fixes.pending.json`];
const below = ["--offline", "--fixes", `${FIXTURES}fixes.below-declared.json`];

test("exit 4 and a plain message when nothing is found", () => {
  const r = run([tmpRepo({ "README.md": "hello" }), ...pending]);
  assert.equal(r.code, 4);
  assert.match(r.out, /0 PHP declarations found: this tool could not see your PHP runtime/);
});

test("exit 3 when only manual findings exist", () => {
  assert.equal(run([tmpRepo({ Dockerfile: "FROM php:8.3-fpm\n" }), ...pending]).code, 3);
});

test("exit 0 needs a prod pin at or above the fix; composer alongside it doesn't block", () => {
  const dir = tmpRepo({ Dockerfile: "FROM php:8.3.98-fpm\n", "composer.json": '{"require": {"php": "^8.3"}}\n' });
  assert.equal(run([dir, ...below]).code, 0);
});

test("exit 3 with only a dev pin and composer: no production runtime declared", () => {
  const dir = tmpRepo({ ".tool-versions": "php 8.3.98\n", "composer.json": '{"require": {"php": "^8.3"}}\n' });
  const r = run([dir, ...below]);
  assert.equal(r.code, 3);
  assert.match(r.out, /no production runtime declared/);
});

test("exit 3 when a candidate file is too big to read", () => {
  const dir = tmpRepo({ Dockerfile: "FROM php:8.3.98-fpm\n", "big/docker-compose.yml": "#" + "x".repeat(1024 * 1024 + 10) });
  const r = run([dir, ...below]);
  assert.equal(r.code, 3);
  assert.match(r.out, /skipped or unparsed: 1 file/);
});

test("exit 2 on errors", () => {
  assert.equal(run(["/definitely/not/here", ...pending]).code, 2);
  assert.equal(run([demo, "--bogus"]).code, 2);
  assert.equal(run([demo, "--fixes", `${FIXTURES}../cli.test.ts`]).code, 2);
});

test('the word "safe" never appears in text, JSON or summary output', () => {
  const many = tmpRepo({
    Dockerfile: "ARG V=7.4\nFROM php:${V}\nFROM php@sha256:abc\nFROM wordpress:6.8-php8.2-apache\nRUN apt-get install -y php8.2-fpm\n",
    "compose.yml": "services:\n  a:\n    image: php:8.5.0RC1\n  b:\n    build: ./vendor/laravel/sail/runtimes/8.4\n",
    ".github/workflows/ci.yml": "steps:\n  - uses: shivammathur/setup-php@v2\n    with:\n      php-version: ${{ fromJSON(x) }}\n",
    ".php-version": "8.3.98\n",
    "composer.json": '{"require": {"php": ">=7.4"}}\n',
  });
  for (const dir of [demo, many]) {
    for (const t of ["pending", "hypothetical", "below-declared"]) {
      for (const fmt of [[], ["--json"], ["--summary"]]) {
        const r = run([dir, "--offline", "--fixes", `${FIXTURES}fixes.${t}.json`, ...fmt]);
        assert.doesNotMatch(r.out + r.err, /\bsafe\b/i, `${dir} ${t} ${fmt.join(" ")}`);
      }
    }
  }
  assert.doesNotMatch(run(["--help"]).out, /\bsafe\b/i);
});

test("compact layout for narrow terminals fits the width and keeps every finding", async () => {
  const { buildReport, renderTextCompact } = await import("../src/report.js");
  const { scan } = await import("../src/scan.js");
  const { loadFixes } = await import("../src/fixes.js");
  const fixes = await loadFixes({ fixesPath: `${FIXTURES}fixes.hypothetical.json` });
  const out = renderTextCompact(buildReport("0.1.0", scan(demo), fixes), false, 54);
  for (const line of out.split("\n")) assert.ok(line.length <= 54, `too wide: ${line}`);
  for (const t of ["FROM php:8.1-fpm", "FROM php:8.3.30-fpm", "apt-get install php8.2-cli", "setup-php 8.3", "php 8.4.20", '"php": "^8.2"']) {
    assert.ok(out.includes(t), t);
  }
  assert.match(out, /ACTION REQUIRED \(3\)[\s\S]*CHECK MANUALLY \(4\)[\s\S]*DECLARED ≥ FIXED \(0\)/);
  assert.doesNotMatch(out, /\bsafe\b/i);
});
