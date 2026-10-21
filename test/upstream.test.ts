import { test } from "node:test";
import assert from "node:assert/strict";
import { checkUpstream, DockerHub } from "../src/upstream.js";
import { classify } from "../src/verdict.js";
import { detectDockerfile } from "../src/detectors/docker.js";
import type { Finding } from "../src/types.js";
import { table } from "./helpers.js";

// Recorded-shape Docker Hub responses (token, multi-arch index, amd64 manifest, image config).
// PHP_VERSION per tag is set by each test; no network.
function fakeHub(phpByTag: Record<string, string>, opts: { status?: number } = {}) {
  const seen: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    const u = String(url);
    seen.push(u);
    if (opts.status) return new Response("{}", { status: opts.status });
    if (u.startsWith("https://auth.docker.io/token")) return Response.json({ token: "anon" });
    const m = /\/v2\/library\/php\/manifests\/([^/]+)$/.exec(u);
    if (m && !m[1]!.startsWith("sha256")) {
      const tag = decodeURIComponent(m[1]!);
      if (!(tag in phpByTag)) return new Response("{}", { status: 404 });
      return Response.json(
        { mediaType: "application/vnd.oci.image.index.v1+json", manifests: [
          { digest: `sha256:${"a".repeat(63)}${Object.keys(phpByTag).indexOf(tag)}`, platform: { os: "linux", architecture: "amd64" } },
          { digest: "sha256:attest", platform: { os: "unknown", architecture: "unknown" } },
        ] },
        { headers: { "docker-content-digest": `sha256:idx${tag}` } },
      );
    }
    if (m) {
      const i = Number(m[1]!.slice(-1));
      return Response.json({ config: { digest: `sha256:cfg${i}` } });
    }
    const b = /\/blobs\/sha256:cfg(\d)$/.exec(u);
    if (b) {
      const tag = Object.keys(phpByTag)[Number(b[1])]!;
      return Response.json({ config: { Env: ["PATH=/usr/local/bin", `PHP_VERSION=${phpByTag[tag]}`] } });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { hub: new DockerHub(fetchImpl), seen };
}

const hypo = table("hypothetical"); // 8.3 fixed in 8.3.99, 8.4 fixed in 8.4.99
const findingsFor = (dockerfile: string) => detectDockerfile("Dockerfile", dockerfile).map((d) => classify(d, hypo));

test("upstream rebuilt: says rebuild and redeploy now, stays CHECK MANUALLY", async () => {
  const { hub } = fakeHub({ "8.3-fpm": "8.3.99" });
  const [f] = findingsFor("FROM php:8.3-fpm\n");
  const warnings: string[] = [];
  await checkUpstream([f!], hypo, hub, (w) => warnings.push(w));
  assert.equal(`${f!.bucket}/${f!.reason}`, "manual/floating-rebuild");
  assert.match(f!.message, /^upstream php:8\.3-fpm rebuilt with 8\.3\.99 \(idx8\.3-fpm\), rebuild with --pull and redeploy now/);
  assert.deepEqual(f!.upstream, { image: "php:8.3-fpm", digest: "sha256:idx8.3-fpm", phpVersion: "8.3.99", rebuilt: true });
  assert.deepEqual(warnings, []);
});

test("upstream not rebuilt: says check again later", async () => {
  const { hub } = fakeHub({ "8.4": "8.4.26" });
  const [f] = findingsFor("FROM php:8.4\n");
  await checkUpstream([f!], hypo, hub, () => {});
  assert.equal(f!.bucket, "manual");
  assert.match(f!.message, /^upstream php:8\.4 not rebuilt yet \(still 8\.4\.26\), check again later$/);
  assert.equal(f!.upstream!.rebuilt, false);
});

test("old base OS tags say they may never be rebuilt", async () => {
  const { hub } = fakeHub({ "8.3-fpm-bullseye": "8.3.20" });
  const [f] = findingsFor("FROM php:8.3-fpm-bullseye\n");
  await checkUpstream([f!], hypo, hub, () => {});
  assert.match(f!.message, /may never be rebuilt, move to a current variant/);
});

test("lookups are cached per run, and only floating official tags are checked", async () => {
  const { hub, seen } = fakeHub({ "8.3-fpm": "8.3.99" });
  const fs = findingsFor("FROM php:8.3-fpm\nFROM php:8.3-fpm AS b\nFROM php:8.3.30-fpm\nARG V=8.3\nFROM php:${V}\n");
  const before = fs.map((f) => f.message);
  await checkUpstream(fs, hypo, hub, () => {});
  assert.equal(seen.filter((u) => u.includes("/manifests/8.3-fpm")).length, 1, "one lookup for two uses of the tag");
  assert.equal(seen.filter((u) => u.startsWith("https://auth.docker.io")).length, 1);
  assert.match(fs[0]!.message, /rebuilt/);
  assert.match(fs[1]!.message, /rebuilt/);
  assert.equal(fs[2]!.message, before[2], "exact pin untouched");
});

test("rate limit or network failure falls back to the normal message with one warning", async () => {
  for (const status of [429, 500]) {
    const { hub } = fakeHub({}, { status });
    const fs = findingsFor("FROM php:8.3-fpm\nFROM php:8.4\n");
    const before = fs.map((f) => f.message);
    const warnings: string[] = [];
    await checkUpstream(fs, hypo, hub, (w) => warnings.push(w));
    assert.deepEqual(fs.map((f) => f.message), before);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /--check-upstream skipped/);
    assert.ok(fs.every((f) => !f.upstream && f.bucket === "manual"));
  }
});

test("a floating tag is never reported as fixed, whatever upstream has", async () => {
  const { hub } = fakeHub({ "8.3": "8.3.99", "8.4-cli": "8.4.99", fpm: "8.5.99", latest: "8.5.99" });
  const fs = findingsFor("FROM php:8.3\nFROM php:8.4-cli\nFROM php:fpm\nFROM php\n");
  await checkUpstream(fs, hypo, hub, () => {});
  assert.ok(fs.every((f: Finding) => f.bucket === "manual"), fs.map((f) => f.bucket).join());
  assert.ok(fs.every((f) => /rebuilt with/.test(f.message)));
});
