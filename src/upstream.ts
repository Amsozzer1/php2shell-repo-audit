// --check-upstream: for floating official php tags, ask Docker Hub which PHP the tag's current image
// sets (PHP_VERSION in the linux/amd64 image config) and say whether upstream has rebuilt with the fix.
// It never moves a finding out of CHECK MANUALLY: the user's own image is old until they rebuild.
// Anonymous Docker Hub requests are rate limited, so lookups are cached per run and any failure falls
// back to the normal floating-rebuild message with a single warning.
import type { Finding, FixTable } from "./types.js";
import { branchOf, compareExact, parseVersion } from "./version.js";
import { contextNote } from "./verdict.js";
import { OLD_BASE_OS } from "./images.js";

const AUTH = "https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/php:pull";
const REGISTRY = "https://registry-1.docker.io/v2/library/php";
const ACCEPT = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

export interface TagInfo {
  digest: string; // the tag's current digest (index digest for multi-arch tags)
  phpVersion: string;
}

interface Manifest {
  manifests?: Array<{ digest: string; platform?: { os?: string; architecture?: string } }>;
  config?: { digest: string };
}

export class DockerHub {
  private token: Promise<string> | null = null;
  private cache = new Map<string, Promise<TagInfo>>();
  requests = 0;
  constructor(private fetchImpl: typeof fetch = fetch, private timeoutMs = 10000) {}

  private async get(url: string, headers: Record<string, string> = {}): Promise<Response> {
    this.requests++;
    const res = await this.fetchImpl(url, { headers, signal: AbortSignal.timeout(this.timeoutMs) });
    if (res.status === 429) throw new Error("Docker Hub rate limit reached");
    if (!res.ok) throw new Error(`Docker Hub ${res.status} for ${url.replace(REGISTRY, "php")}`);
    return res;
  }

  private bearer(): Promise<string> {
    this.token ??= this.get(AUTH).then(async (r) => ((await r.json()) as { token: string }).token);
    return this.token;
  }

  lookup(tag: string): Promise<TagInfo> {
    let p = this.cache.get(tag);
    if (!p) {
      p = this.fetchTag(tag);
      this.cache.set(tag, p);
    }
    return p;
  }

  private async fetchTag(tag: string): Promise<TagInfo> {
    const auth = { Authorization: `Bearer ${await this.bearer()}` };
    const top = await this.get(`${REGISTRY}/manifests/${encodeURIComponent(tag)}`, { ...auth, Accept: ACCEPT });
    const digest = top.headers.get("docker-content-digest") ?? "";
    let manifest = (await top.json()) as Manifest;
    if (manifest.manifests) {
      const amd64 = manifest.manifests.find((m) => m.platform?.os === "linux" && m.platform?.architecture === "amd64");
      if (!amd64) throw new Error(`php:${tag} has no linux/amd64 image`);
      manifest = (await (await this.get(`${REGISTRY}/manifests/${amd64.digest}`, { ...auth, Accept: ACCEPT })).json()) as Manifest;
    }
    if (!manifest.config) throw new Error(`php:${tag}: no image config in the manifest`);
    const config = (await (await this.get(`${REGISTRY}/blobs/${manifest.config.digest}`, auth)).json()) as { config?: { Env?: string[] } };
    const env = config.config?.Env?.find((e) => e.startsWith("PHP_VERSION="));
    if (!env) throw new Error(`php:${tag}: image config sets no PHP_VERSION`);
    return { digest, phpVersion: env.slice("PHP_VERSION=".length) };
  }
}

// Rewrites the message of each floating official-image finding with what Docker Hub reports.
export async function checkUpstream(findings: Finding[], table: FixTable, hub: DockerHub, warn: (w: string) => void): Promise<void> {
  let warned = false;
  for (const f of findings) {
    if (f.kind !== "official-image" || f.reason !== "floating-rebuild" || !f.tag) continue;
    let info: TagInfo;
    try {
      info = await hub.lookup(f.tag);
    } catch (e) {
      if (!warned) warn(`--check-upstream skipped: ${(e as Error).message}; showing the normal floating-tag message`);
      warned = true;
      continue;
    }
    const v = parseVersion(info.phpVersion);
    const fixed = v ? table.branches[branchOf(v) ?? ""]?.fixed ?? null : null;
    const rebuilt = v && fixed ? compareExact(v, parseVersion(fixed)!) >= 0 : null;
    const short = info.digest.replace(/^sha256:/, "").slice(0, 12);
    const oldOs = f.note && OLD_BASE_OS.test(f.note);
    let msg: string;
    if (rebuilt === true) msg = `upstream php:${f.tag} rebuilt with ${info.phpVersion} (${short}), rebuild with --pull and redeploy now, then confirm with the docker run check`;
    else if (rebuilt === false)
      msg = oldOs
        ? `upstream php:${f.tag} not rebuilt (still ${info.phpVersion}); tags on an old base OS (${f.note}) may never be rebuilt, move to a current variant`
        : `upstream php:${f.tag} not rebuilt yet (still ${info.phpVersion}), check again later`;
    else msg = `upstream php:${f.tag} has ${info.phpVersion}, and the fix table has no fixed version for that branch; check it manually`;
    const note = contextNote(f);
    f.message = note ? `${msg} (${note})` : msg;
    f.upstream = { image: `php:${f.tag}`, digest: info.digest, phpVersion: info.phpVersion, rebuilt };
  }
}
