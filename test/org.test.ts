import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GitHub } from "../src/github.js";
import { scanOrg } from "../src/org.js";
import { buildOrgReport, renderOrgJson, renderOrgMarkdown, renderOrgText } from "../src/org-report.js";
import { loadFixes } from "../src/fixes.js";
import { FIXTURES, REPO_ROOT } from "./helpers.js";

interface Route {
  status: number;
  headers?: Record<string, string>;
  body: unknown;
}
const fx = JSON.parse(readFileSync(`${FIXTURES}org/example-org.json`, "utf8")) as { api: string; routes: Record<string, Route> };

// Serves the recorded fixture. `tweak` can replace a response for one request.
function fixtureFetch(seen: string[], tweak?: (path: string, r: Route, n: number) => Route | undefined): typeof fetch {
  let n = 0;
  return (async (url: string | URL | Request) => {
    const path = String(url).slice(fx.api.length);
    seen.push(path);
    const route = fx.routes[path] ?? { status: 404, body: { message: "Not Found" } };
    const r = tweak?.(path, route, n++) ?? route;
    return new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers });
  }) as typeof fetch;
}

function client(seen: string[], extra: Partial<ConstructorParameters<typeof GitHub>[0]> = {}, tweak?: Parameters<typeof fixtureFetch>[1]) {
  const sleeps: number[] = [];
  const logs: string[] = [];
  const gh = new GitHub({
    token: "test-token",
    fetchImpl: fixtureFetch(seen, tweak),
    sleep: async (ms) => void sleeps.push(ms),
    now: () => 1792579990 * 1000,
    log: (l) => void logs.push(l),
    ...extra,
  });
  return { gh, sleeps, logs };
}

const quiet = { log: () => {} };

test("org scan: pagination, archived and forks skipped, empty repo handled", async () => {
  const seen: string[] = [];
  const { gh } = client(seen);
  const s = await scanOrg(gh, "example-org", quiet);
  assert.ok(seen.some((p) => p.endsWith("&page=2")), "followed the Link header to page 2");
  assert.deepEqual(s.skippedRepos, { archived: ["example-org/old-intranet"], forks: ["example-org/forked-lib"] });
  assert.deepEqual(s.repos.map((r) => r.name), [
    "example-org/empty-repo",
    "example-org/frontend",
    "example-org/legacy-billing",
    "example-org/marketing-site",
    "example-org/queue-worker",
    "example-org/shop-api",
  ]);
  assert.equal(s.repos.find((r) => r.name === "example-org/legacy-billing")!.branch, "master");
});

test("org scan fetches only the files the detectors read, one trees call per repo", async () => {
  const seen: string[] = [];
  const { gh } = client(seen);
  await scanOrg(gh, "example-org", quiet);
  const blobs = seen.filter((p) => p.includes("/git/blobs/"));
  const trees = seen.filter((p) => p.includes("/git/trees/"));
  assert.equal(trees.length, 6, "one per scanned repo (the empty one answers 409), none for skipped repos");
  // shop-api has README.md, src/index.php and vendor/.../composer.json in its tree; none are fetched.
  assert.equal(blobs.filter((p) => p.startsWith("/repos/example-org/shop-api/")).length, 3);
  assert.equal(blobs.filter((p) => p.startsWith("/repos/example-org/frontend/")).length, 1); // Dockerfile only
  assert.ok(!seen.some((p) => p.includes("old-intranet") || p.includes("forked-lib")));
});

test("--include-forks scans forks", async () => {
  const { gh } = client([]);
  const s = await scanOrg(gh, "example-org", { ...quiet, includeForks: true });
  assert.ok(s.repos.some((r) => r.name === "example-org/forked-lib"));
  assert.deepEqual(s.skippedRepos.forks, []);
});

test("a user account works through the /users fallback", async () => {
  const seen: string[] = [];
  const { gh } = client(seen);
  const s = await scanOrg(gh, "example-user", quiet);
  assert.ok(seen[0]!.startsWith("/orgs/example-user/"));
  assert.deepEqual(s.repos.map((r) => r.name), ["example-user/side-project"]);
});

async function report(table: "pending" | "hypothetical", opts: { includeForks?: boolean } = {}) {
  const { gh } = client([]);
  const fixes = await loadFixes({ fixesPath: `${FIXTURES}fixes.${table}.json` });
  return buildOrgReport("0.0.0-test", await scanOrg(gh, "example-org", { ...quiet, ...opts }), fixes);
}

test("org report with the pending table: buckets grouped by repo, exit 1", async () => {
  const r = await report("pending");
  assert.deepEqual(r.counts, { action: 1, manual: 7, fixed: 0 });
  assert.equal(r.exit.code, 1);
  assert.deepEqual(r.noDeclarations, ["example-org/empty-repo", "example-org/frontend"]);
  assert.equal(r.repos[0]!.name, "example-org/legacy-billing", "repos with ACTION REQUIRED come first");
  const byRepo = Object.fromEntries(r.repos.map((x) => [x.name, [x.report.counts.action, x.report.counts.manual, x.report.counts.fixed]]));
  assert.deepEqual(byRepo, {
    "example-org/legacy-billing": [1, 1, 0],
    "example-org/marketing-site": [0, 1, 0],
    "example-org/queue-worker": [0, 2, 0],
    "example-org/shop-api": [0, 3, 0],
  });
});

test("org report with the hypothetical table: exact pins below the fix become ACTION REQUIRED", async () => {
  const r = await report("hypothetical");
  assert.deepEqual(r.counts, { action: 3, manual: 5, fixed: 0 });
});

test("org text, JSON and Markdown outputs", async () => {
  const r = await report("pending");
  const text = renderOrgText(r, false);
  assert.match(text, /== example-org\/legacy-billing \(master\)/);
  assert.match(text, /6 repos scanned \(skipped 1 archived, 1 fork\), 4 declare PHP/);
  assert.match(text, /No PHP declarations found in 2 repo\(s\)/);
  const md = renderOrgMarkdown(r);
  assert.match(md, /\*\*ACTION REQUIRED\*\*\n- `example-org\/legacy-billing` `docker\/Dockerfile:1` `FROM php:7\.4-apache`: eol/);
  assert.match(md, /\*\*CHECK MANUALLY\*\*/);
  const json = JSON.parse(renderOrgJson(r)) as { repos: Array<{ name: string; findings: unknown[] }>; exitCode: number };
  assert.equal(json.exitCode, 1);
  assert.equal(json.repos.length, 4);
  for (const out of [text, md, renderOrgJson(r)]) assert.doesNotMatch(out, /\bsafe\b/i);
});

test("rate limit: waits until reset when no requests are left, then retries", async () => {
  const seen: string[] = [];
  const { gh, sleeps, logs } = client(seen, {}, (_p, r, n) =>
    n === 0 ? { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1792580000" }, body: { message: "API rate limit exceeded" } } : r,
  );
  const s = await scanOrg(gh, "example-org", quiet);
  assert.equal(s.repos.length, 6);
  assert.deepEqual(sleeps, [10000]); // reset is 10 s after the fake clock
  assert.match(logs[0]!, /rate limit: no requests left, waiting 10s/);
});

test("rate limit: secondary limits honour retry-after, and a low remaining count waits for the reset", async () => {
  const a = client([], {}, (_p, r, n) => (n === 0 ? { status: 429, headers: { "retry-after": "3" }, body: {} } : r));
  await scanOrg(a.gh, "example-org", quiet);
  assert.deepEqual(a.sleeps, [3000]);
  const b = client([], {}, (_p, r, n) => (n === 1 ? { ...r, headers: { ...r.headers, "x-ratelimit-remaining": "4" } } : r));
  await scanOrg(b.gh, "example-org", quiet);
  assert.deepEqual(b.sleeps, [10000]);
  assert.match(b.logs[0]!, /4 requests left/);
});

test("truncated trees and files over 1 MB are reported as skipped, so the repo needs a manual check", async () => {
  const { gh } = client([], {}, (p, r) => {
    if (p !== "/repos/example-org/marketing-site/git/trees/main?recursive=1") return undefined;
    const body = r.body as { tree: unknown[] };
    return { ...r, body: { ...body, truncated: true, tree: [...body.tree, { path: "big/compose.yml", type: "blob", sha: "f".repeat(40), size: 2_000_000 }] } };
  });
  const fixes = await loadFixes({ fixesPath: `${FIXTURES}fixes.pending.json` });
  const r = buildOrgReport("0.0.0-test", await scanOrg(gh, "example-org", quiet), fixes);
  const site = r.repos.find((x) => x.name === "example-org/marketing-site")!;
  assert.equal(site.report.skipped.length, 2);
  assert.match(renderOrgText(r, false), /skipped or unparsed: \(file list truncated/);
});

test("refuses to follow a pagination link to another host", async () => {
  const { gh } = client([], {}, (p, r) =>
    p === "/orgs/example-org/repos?per_page=100&type=all" ? { ...r, headers: { link: '<https://evil.example/next>; rel="next"' } } : r,
  );
  await assert.rejects(scanOrg(gh, "example-org", quiet), /off the API host/);
});

test("CLI --org end to end against the local mock API", async () => {
  const port = String(20000 + Math.floor(Math.random() * 20000));
  const mock = spawn(process.execPath, [`${REPO_ROOT}scripts/mock-github.mjs`, `${FIXTURES}org/example-org.json`, port]);
  try {
    await new Promise<void>((resolve, reject) => {
      mock.stdout.on("data", (d: Buffer) => d.toString().includes("mock GitHub API") && resolve());
      mock.on("exit", () => reject(new Error("mock server exited")));
    });
    const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
    const run = (args: string[]) =>
      new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
        const p = spawn(process.execPath, [cli, "--org", "example-org", "--offline", "--fixes", `${FIXTURES}fixes.pending.json`, ...args], {
          env: { ...process.env, GITHUB_API_URL: `http://127.0.0.1:${port}`, GH_TOKEN: "test-token", NO_COLOR: "1" },
        });
        let out = "";
        let err = "";
        p.stdout.on("data", (d: Buffer) => (out += d));
        p.stderr.on("data", (d: Buffer) => (err += d));
        p.on("close", (code) => resolve({ code, out, err }));
      });
    const j = await run(["--json"]);
    assert.equal(j.code, 1);
    const parsed = JSON.parse(j.out) as { counts: Record<string, number> };
    assert.deepEqual(parsed.counts, { actionRequired: 1, checkManually: 7, declaredFixed: 0 });
    assert.match(j.err, /\[6\/6\] example-org\/shop-api/);
    const md = await run(["--markdown"]);
    assert.match(md.out, /PHP versions declared in `example-org`/);
  } finally {
    mock.kill();
  }
});

test("a repo reported with size 0 is still scanned (GitHub reports 0 for new repos)", async () => {
  const seen: string[] = [];
  const { gh } = client(seen, {}, (p, r) =>
    p === "/orgs/example-org/repos?per_page=100&type=all"
      ? { ...r, body: (r.body as Array<{ size: number }>).map((x) => ({ ...x, size: 0 })) }
      : undefined,
  );
  const s = await scanOrg(gh, "example-org", quiet);
  assert.ok(s.repos.find((x) => x.name === "example-org/shop-api")!.scan.declarations.length > 0);
});

test("--repo: one repo through the API, archived and forks included", async () => {
  const { getRepo, scanRepo } = await import("../src/org.js");
  const { gh } = client([]);
  const r = await getRepo(gh, "example-org/forked-lib");
  assert.equal(r.fork, true);
  const s = await scanRepo(gh, r);
  assert.equal(s.declarations.length, 1);
  await assert.rejects(getRepo(gh, "example-org/missing"), /repo not found, or not visible/);
  await assert.rejects(getRepo(gh, "not-a-repo"), /owner\/name/);
});

test("without a token the client sends no Authorization header", async () => {
  const headers: Array<Record<string, string>> = [];
  const gh = new GitHub({
    token: null,
    fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
      headers.push(init?.headers as Record<string, string>);
      const r = fx.routes[String(url).slice(fx.api.length)]!;
      return new Response(JSON.stringify(r.body), { status: r.status, headers: r.headers });
    }) as typeof fetch,
    log: () => {},
  });
  await gh.get("/repos/example-org/shop-api");
  assert.equal("Authorization" in headers[0]!, false);
});

test("CLI --repo end to end against the local mock API", async () => {
  const port = String(20000 + Math.floor(Math.random() * 20000));
  const mock = spawn(process.execPath, [`${REPO_ROOT}scripts/mock-github.mjs`, `${FIXTURES}org/example-org.json`, port]);
  try {
    await new Promise<void>((resolve, reject) => {
      mock.stdout.on("data", (d: Buffer) => d.toString().includes("mock GitHub API") && resolve());
      mock.on("exit", () => reject(new Error("mock server exited")));
    });
    const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
    const out = await new Promise<{ code: number | null; out: string }>((resolve) => {
      const p = spawn(process.execPath, [cli, "--repo", "example-org/legacy-billing", "--offline", "--fixes", `${FIXTURES}fixes.pending.json`, "--json"], {
        env: { ...process.env, GITHUB_API_URL: `http://127.0.0.1:${port}`, GH_TOKEN: "test-token", NO_COLOR: "1" },
      });
      let o = "";
      p.stdout.on("data", (d: Buffer) => (o += d));
      p.on("close", (code) => resolve({ code, out: o }));
    });
    assert.equal(out.code, 1);
    const j = JSON.parse(out.out) as { repo: { name: string; branch: string }; counts: Record<string, number> };
    assert.deepEqual(j.repo, { name: "example-org/legacy-billing", branch: "master" });
    assert.deepEqual(j.counts, { actionRequired: 1, checkManually: 1, declaredFixed: 0 });
  } finally {
    mock.kill();
  }
});
