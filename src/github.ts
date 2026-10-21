// Minimal read-only GitHub REST client: GET only, follows Link pagination, waits out rate limits.
import { execFileSync } from "node:child_process";

export interface ClientOptions {
  token: string;
  baseUrl?: string; // GITHUB_API_URL, for GitHub Enterprise or a local mock
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number; // ms
  log?: (line: string) => void;
  lowWater?: number; // wait for the reset when fewer requests than this remain
}

export class HttpError extends Error {
  constructor(public status: number, public path: string) {
    super(`GitHub API ${status} for ${path}`);
  }
}

export function resolveToken(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.GH_TOKEN) return env.GH_TOKEN;
  if (env.GITHUB_TOKEN) return env.GITHUB_TOKEN;
  try {
    const t = execFileSync("gh", ["auth", "token"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return t || null;
  } catch {
    return null;
  }
}

export class GitHub {
  readonly base: string;
  private readonly o: Required<Omit<ClientOptions, "baseUrl">>;
  requests = 0;

  constructor(opts: ClientOptions) {
    this.base = (opts.baseUrl ?? "https://api.github.com").replace(/\/+$/, "");
    this.o = {
      token: opts.token,
      fetchImpl: opts.fetchImpl ?? fetch,
      sleep: opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
      now: opts.now ?? Date.now,
      log: opts.log ?? ((l) => process.stderr.write(l + "\n")),
      lowWater: opts.lowWater ?? 10,
    };
  }

  private async wait(seconds: number, why: string) {
    const s = Math.max(1, Math.ceil(seconds));
    this.o.log(`rate limit: ${why}, waiting ${s}s`);
    await this.o.sleep(s * 1000);
  }

  private resetIn(res: Response): number {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    return Number.isFinite(reset) && reset > 0 ? reset - this.o.now() / 1000 : 60;
  }

  // GET a path (or an absolute URL on the same API host) and return parsed JSON plus headers.
  async get<T>(pathOrUrl: string): Promise<{ body: T; headers: Headers }> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : this.base + pathOrUrl;
    if (!url.startsWith(this.base + "/")) throw new Error(`refusing to follow a URL off the API host: ${url}`);
    for (let attempt = 0; attempt < 6; attempt++) {
      this.requests++;
      const res = await this.o.fetchImpl(url, {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${this.o.token}`,
          "X-GitHub-Api-Version": "2022-11-28",
          "User-Agent": "php2shell-repo-audit",
        },
        signal: AbortSignal.timeout(30000),
      });
      const remaining = res.headers.get("x-ratelimit-remaining");
      const retryAfter = res.headers.get("retry-after");
      if ((res.status === 403 || res.status === 429) && (remaining === "0" || retryAfter)) {
        await this.wait(retryAfter ? Number(retryAfter) : this.resetIn(res), retryAfter ? "secondary limit" : "no requests left");
        continue;
      }
      if (!res.ok) throw new HttpError(res.status, url.slice(this.base.length));
      const body = (await res.json()) as T;
      if (remaining !== null && Number(remaining) < this.o.lowWater) {
        await this.wait(this.resetIn(res), `${remaining} requests left`);
      }
      return { body, headers: res.headers };
    }
    throw new Error(`GitHub API still rate limited after retries: ${url}`);
  }

  // Follows rel="next" links and concatenates array pages.
  async getAll<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    let next: string | null = path;
    while (next) {
      const page: { body: T[]; headers: Headers } = await this.get<T[]>(next);
      out.push(...page.body);
      const link: string = page.headers.get("link") ?? "";
      next = /<([^>]+)>;\s*rel="next"/.exec(link)?.[1] ?? null;
    }
    return out;
  }
}
