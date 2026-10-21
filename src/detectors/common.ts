// Helpers shared by the Dockerfile and YAML detectors.
import type { Context, Declaration } from "../types.js";
import { bundlesPhp, isOfficialPhp, parseImageRef, parseOfficialTag, phpFromThirdParty } from "../images.js";

export interface Resolved {
  value: string;
  usedDefault: boolean; // a variable was replaced by an ARG or ${VAR:-x} default
  unresolved: boolean; // a variable had no value
}

// Replaces ${VAR}, ${VAR:-x}, ${VAR-x} and $VAR using the given defaults.
export function resolveVars(text: string, vars: Record<string, string | undefined>): Resolved {
  let usedDefault = false;
  let unresolved = false;
  const value = text.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::?-([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_m, a, def, b) => {
    const name = (a ?? b) as string;
    const v = vars[name];
    if (v !== undefined && v !== "") {
      usedDefault = true;
      return v;
    }
    if (def !== undefined && def !== "") {
      usedDefault = true;
      return def as string;
    }
    unresolved = true;
    return "";
  });
  return { value, usedDefault, unresolved };
}

// Turns an image reference into a declaration, or null if the image has nothing to do with PHP.
export function imageDeclaration(
  raw: string,
  vars: Record<string, string | undefined>,
  where: { file: string; line: number; context: Context; prefix: string },
): Declaration | null {
  const base = { file: where.file, line: where.line, context: where.context, text: `${where.prefix}${raw}` };
  if (/\$\{\{/.test(raw)) {
    return /php/i.test(raw) ? { ...base, kind: "unresolved", version: null } : null;
  }
  const r = /\$/.test(raw) ? resolveVars(raw, vars) : { value: raw, usedDefault: false, unresolved: false };
  if (r.unresolved) {
    return /php/i.test(raw) ? { ...base, kind: "unresolved", version: null } : null;
  }
  const ref = parseImageRef(r.value);
  if (!ref) return null;
  if (isOfficialPhp(ref)) {
    const tag = parseOfficialTag(ref.tag);
    const version = tag.version ?? ref.tag ?? "latest";
    if (ref.digest) return { ...base, kind: "digest", version, note: ref.digest };
    return { ...base, kind: r.usedDefault ? "build-arg" : "official-image", version, note: tag.osSuffix ?? undefined, tag: ref.tag ?? "latest" };
  }
  if (bundlesPhp(ref)) return { ...base, kind: "third-party-image", version: phpFromThirdParty(ref), note: ref.name };
  return null;
}

export function stripYamlValue(v: string): string {
  let s = v.trim();
  if (s.startsWith('"') || s.startsWith("'")) {
    const q = s[0]!;
    const end = s.indexOf(q, 1);
    return end > 0 ? s.slice(1, end) : s.slice(1);
  }
  const hash = s.search(/\s#/);
  if (hash >= 0) s = s.slice(0, hash);
  return s.trim();
}
