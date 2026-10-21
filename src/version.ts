// Parsing and comparing PHP version strings. The EOL list always comes from the fix table.

export interface PhpVersion {
  major: number;
  minor: number | null;
  patch: number | null;
  pre: string | null; // "RC1", "beta2", "alpha1", "dev"
  raw: string;
}

// Accepts "8", "8.3", "8.3.30", "8.x", "8.3.x", "8.5.0RC1", "8.5.0-rc1", "v8.3".
export function parseVersion(input: string): PhpVersion | null {
  const raw = input.trim();
  const m = /^v?(\d{1,2})(?:\.(\d{1,2}|x|\*))?(?:\.(\d{1,3}|x|\*))?(?:[-.]?((?:rc|beta|alpha|dev)\d*))?$/i.exec(raw);
  if (!m) return null;
  const major = Number(m[1]);
  const minor = m[2] === undefined || /[x*]/i.test(m[2]) ? null : Number(m[2]);
  const patch = minor === null || m[3] === undefined || /[x*]/i.test(m[3]) ? null : Number(m[3]);
  const pre = m[4] ? m[4].toUpperCase() : null;
  return { major, minor, patch, pre, raw };
}

export function branchOf(v: PhpVersion): string | null {
  return v.minor === null ? null : `${v.major}.${v.minor}`;
}

// Pre-release order: dev < alpha < beta < RC < final release; then the number (RC3 < RC4).
function preRank(pre: string | null): [number, number] {
  if (pre === null) return [4, 0];
  const m = /^(DEV|ALPHA|BETA|RC)(\d*)$/.exec(pre);
  const kind = m ? { DEV: 0, ALPHA: 1, BETA: 2, RC: 3 }[m[1] as "DEV" | "ALPHA" | "BETA" | "RC"] : 0;
  return [kind, m && m[2] ? Number(m[2]) : 0];
}

// Compares two exact versions (patch required on both), including pre-releases. Negative if a < b.
export function compareExact(a: PhpVersion, b: PhpVersion): number {
  const [ak, an] = preRank(a.pre);
  const [bk, bn] = preRank(b.pre);
  return a.major - b.major || (a.minor ?? 0) - (b.minor ?? 0) || (a.patch ?? 0) - (b.patch ?? 0) || ak - bk || an - bn;
}

// EOL entries are either a major ("5", "7") or a branch ("8.0", "8.1").
export function isEol(v: PhpVersion, eol: string[]): boolean {
  for (const e of eol) {
    const parts = e.split(".");
    if (parts.length === 1 && Number(parts[0]) === v.major) return true;
    if (parts.length === 2 && v.minor !== null && Number(parts[0]) === v.major && Number(parts[1]) === v.minor) return true;
  }
  return false;
}
