import { test } from "node:test";
import assert from "node:assert/strict";
import { loadFixes, REMOTE_URL, validateTable } from "../src/fixes.js";
import type { FixTable } from "../src/types.js";
import { FIXTURES, table } from "./helpers.js";

const pendingPath = `${FIXTURES}fixes.pending.json`;
const publishedPath = `${FIXTURES}fixes.hypothetical.json`;

function fakeFetch(body: unknown, opts: { status?: number; delayMs?: number; raw?: string } = {}): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(String(url), REMOTE_URL);
    if (opts.delayMs) {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, opts.delayMs);
        init?.signal?.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new Error("timed out"));
        });
      });
    }
    return new Response(opts.raw ?? JSON.stringify(body), { status: opts.status ?? 200 });
  }) as typeof fetch;
}

function withBranch(base: FixTable, branch: string, entry: FixTable["branches"][string], extra: Partial<FixTable> = {}): FixTable {
  return { ...base, ...extra, branches: { ...base.branches, [branch]: entry } };
}

test("bundled fixtures validate", () => {
  for (const name of ["pending", "hypothetical", "below-declared"] as const) assert.deepEqual(validateTable(table(name)), [], name);
});

test("valid remote table is used", async () => {
  const remote = { ...table("hypothetical"), revision: 2 };
  const r = await loadFixes({ bundledPath: publishedPath, fetchImpl: fakeFetch(remote) });
  assert.equal(r.origin, "remote");
  assert.equal(r.table.revision, 2);
});

test("remote timeout falls back to bundled", async () => {
  const r = await loadFixes({ bundledPath: pendingPath, fetchImpl: fakeFetch(table("hypothetical"), { delayMs: 500 }), timeoutMs: 50 });
  assert.equal(r.origin, "bundled");
  assert.match(r.warnings[0]!, /unavailable/);
});

test("--offline never fetches", async () => {
  const r = await loadFixes({ offline: true, bundledPath: pendingPath, fetchImpl: (() => { throw new Error("fetched"); }) as typeof fetch });
  assert.equal(r.origin, "bundled");
  assert.equal(r.table.status, "pending");
});

test("--fixes reads the given file and validates it", async () => {
  const r = await loadFixes({ fixesPath: publishedPath });
  assert.equal(r.origin, "file");
  await assert.rejects(loadFixes({ fixesPath: `${FIXTURES}../stub.test.ts` }));
});

test("null fixed values mean pending", async () => {
  const r = await loadFixes({ offline: true, bundledPath: pendingPath });
  assert.ok(Object.values(r.table.branches).every((b) => b.fixed === null));
});

const rejected: Array<[string, unknown, string]> = [
  ["malformed JSON", null, "unavailable"],
  ["wrong shape", { hello: "world" }, "rejected"],
  ["fixed below the floor", withBranch(table("hypothetical"), "8.3", { fixed: "8.3.3" }), "floor"],
  ["fixed on the wrong branch", withBranch(table("hypothetical"), "8.3", { fixed: "8.4.99" }), "not an X.Y.Z release on this branch"],
  ["unknown branch", withBranch(table("hypothetical"), "8.6", { fixed: "8.6.1" }), "unknown branch"],
  ["affected false with a fixed version", withBranch(table("hypothetical"), "8.2", { fixed: "8.2.99", affected: false }), "cannot have a fixed"],
  ["published with all null", { ...table("pending"), status: "published" }, "no fixed version"],
  ["pending with a fixed version", { ...table("hypothetical"), status: "pending" }, "status pending"],
];

for (const [name, remote, why] of rejected) {
  test(`remote rejected: ${name}`, async () => {
    const fetchImpl = remote === null ? fakeFetch(null, { raw: "{not json" }) : fakeFetch(remote);
    const r = await loadFixes({ bundledPath: pendingPath, fetchImpl });
    assert.equal(r.origin, "bundled");
    assert.match(r.warnings[0]!, new RegExp(why));
  });
}

test("remote may not be older, lower or null a bundled fix, or add affected false", async () => {
  const cases: Array<[FixTable, RegExp]> = [
    [{ ...table("hypothetical"), revision: 0 + 1 }, /./], // same revision is fine, checked separately below
    [withBranch(table("hypothetical"), "8.3", { fixed: "8.3.98" }, { revision: 2 }), /lowers/],
    [withBranch(table("hypothetical"), "8.3", { fixed: null }, { revision: 2 }), /removes/],
    [withBranch(table("hypothetical"), "8.3", { fixed: null, affected: false }, { revision: 2 }), /not affected|removes/],
  ];
  const bundled = `${FIXTURES}fixes.hypothetical.json`;
  const same = await loadFixes({ bundledPath: bundled, fetchImpl: fakeFetch(cases[0]![0]) });
  assert.equal(same.origin, "remote");
  for (const [remote, why] of cases.slice(1)) {
    const r = await loadFixes({ bundledPath: bundled, fetchImpl: fakeFetch(remote) });
    assert.equal(r.origin, "bundled");
    assert.match(r.warnings[0]!, why);
  }
  const older = await loadFixes({ bundledPath: bundled, fetchImpl: fakeFetch({ ...table("hypothetical"), revision: 0 }) });
  assert.equal(older.origin, "bundled");
});

test("remote may not add affected false to a pending branch", async () => {
  const remote = withBranch(table("pending"), "8.2", { fixed: null, affected: false }, { revision: 2 });
  const r = await loadFixes({ bundledPath: pendingPath, fetchImpl: fakeFetch(remote) });
  assert.equal(r.origin, "bundled");
  assert.match(r.warnings[0]!, /not affected/);
});

test("HTTP errors fall back to bundled", async () => {
  const r = await loadFixes({ bundledPath: pendingPath, fetchImpl: fakeFetch({}, { status: 404 }) });
  assert.equal(r.origin, "bundled");
});
