// --org: scans the default branch of every repo in a GitHub org (or user account) through the
// REST API. One trees call per repo, then one blob call per file the detectors read.
import type { Declaration } from "./types.js";
import { GitHub, HttpError } from "./github.js";
import { SIZE_CAP } from "./walk.js";
import { detectFile, inSkippedDir, isCandidate, sortDeclarations, type ScanResult } from "./scan.js";

export interface ApiRepo {
  full_name: string;
  default_branch: string;
  archived: boolean;
  fork: boolean;
  disabled?: boolean;
  size: number;
}

interface TreeEntry {
  path: string;
  type: string;
  sha: string;
  size?: number;
}

export interface RepoScan {
  name: string;
  branch: string;
  scan: ScanResult;
}

export interface OrgScan {
  org: string;
  repos: RepoScan[];
  skippedRepos: { archived: string[]; forks: string[] };
  requests: number;
}

async function listRepos(gh: GitHub, org: string): Promise<ApiRepo[]> {
  const q = "per_page=100&type=all";
  try {
    return await gh.getAll<ApiRepo>(`/orgs/${encodeURIComponent(org)}/repos?${q}`);
  } catch (e) {
    if (!(e instanceof HttpError) || e.status !== 404) throw e;
    // Not an organization: try it as a user account.
    return gh.getAll<ApiRepo>(`/users/${encodeURIComponent(org)}/repos?${q}`);
  }
}

export async function scanRepo(gh: GitHub, repo: ApiRepo): Promise<ScanResult> {
  const result: ScanResult = { declarations: [], filesRead: 0, skipped: [] };
  // Don't trust repo.size: GitHub reports 0 for recently created repos. An empty repo answers 409.
  let tree: { tree: TreeEntry[]; truncated: boolean };
  try {
    tree = (await gh.get<{ tree: TreeEntry[]; truncated: boolean }>(
      `/repos/${repo.full_name}/git/trees/${encodeURIComponent(repo.default_branch)}?recursive=1`,
    )).body;
  } catch (e) {
    if (e instanceof HttpError && (e.status === 409 || e.status === 404)) return result; // empty repo
    throw e;
  }
  if (tree.truncated) result.skipped.push("(file list truncated by the GitHub API; some files were not read)");
  const files = tree.tree.filter((e) => e.type === "blob" && isCandidate(e.path) && !inSkippedDir(e.path));
  const declarations: Declaration[] = [];
  for (const f of files) {
    if ((f.size ?? 0) > SIZE_CAP) {
      result.skipped.push(f.path);
      continue;
    }
    const blob = (await gh.get<{ content: string; encoding: string }>(`/repos/${repo.full_name}/git/blobs/${f.sha}`)).body;
    const content = blob.encoding === "base64" ? Buffer.from(blob.content, "base64").toString("utf8") : blob.content;
    declarations.push(...detectFile(f.path, content));
    result.filesRead++;
  }
  result.declarations = sortDeclarations(declarations);
  return result;
}

// --repo owner/name: one repo through the API, without cloning. Archived repos and forks are scanned too.
export async function getRepo(gh: GitHub, fullName: string): Promise<ApiRepo> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(fullName)) throw new Error(`--repo needs owner/name, got "${fullName}"`);
  try {
    return (await gh.get<ApiRepo>(`/repos/${fullName}`)).body;
  } catch (e) {
    if (e instanceof HttpError && e.status === 404) throw new Error(`${fullName}: repo not found, or not visible without a token that can read it`);
    throw e;
  }
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export async function scanOrg(
  gh: GitHub,
  org: string,
  opts: { includeForks?: boolean; log?: (line: string) => void } = {},
): Promise<OrgScan> {
  const log = opts.log ?? ((l: string) => process.stderr.write(l + "\n"));
  const all = await listRepos(gh, org);
  const skippedRepos = { archived: [] as string[], forks: [] as string[] };
  const targets: ApiRepo[] = [];
  for (const r of all) {
    if (r.archived || r.disabled) skippedRepos.archived.push(r.full_name);
    else if (r.fork && !opts.includeForks) skippedRepos.forks.push(r.full_name);
    else targets.push(r);
  }
  targets.sort((a, b) => (a.full_name < b.full_name ? -1 : 1));
  log(`${org}: ${plural(targets.length, "repo")} to scan (skipped ${skippedRepos.archived.length} archived, ${plural(skippedRepos.forks.length, "fork")})`);
  const repos: RepoScan[] = [];
  for (const [i, r] of targets.entries()) {
    const scan = await scanRepo(gh, r);
    log(`[${i + 1}/${targets.length}] ${r.full_name}: ${plural(scan.filesRead, "file")} read, ${plural(scan.declarations.length, "declaration")}`);
    repos.push({ name: r.full_name, branch: r.default_branch, scan });
  }
  return { org, repos, skippedRepos, requests: gh.requests };
}
