// Container image references: the official php image, and images that bundle PHP under another name.

export interface ImageRef {
  name: string; // repository path without registry prefix for Docker Hub, e.g. "php", "bitnami/php-fpm"
  tag: string | null;
  digest: string | null;
}

const DOCKER_HUB_PREFIXES = [
  "docker.io/library/",
  "docker.io/",
  "index.docker.io/library/",
  "index.docker.io/",
  "registry-1.docker.io/library/",
  "registry.hub.docker.com/library/",
  "mirror.gcr.io/library/",
  "public.ecr.aws/docker/library/",
  "library/",
];

export function parseImageRef(ref: string): ImageRef | null {
  let s = ref.trim().replace(/^["']|["']$/g, "");
  if (!s || /\s/.test(s)) return null;
  let digest: string | null = null;
  const at = s.indexOf("@");
  if (at >= 0) {
    digest = s.slice(at + 1);
    s = s.slice(0, at);
  }
  let tag: string | null = null;
  const lastSlash = s.lastIndexOf("/");
  const colon = s.indexOf(":", lastSlash + 1);
  if (colon >= 0) {
    tag = s.slice(colon + 1);
    s = s.slice(0, colon);
  }
  let name = s.toLowerCase();
  for (const p of DOCKER_HUB_PREFIXES) {
    if (name.startsWith(p)) {
      name = name.slice(p.length);
      break;
    }
  }
  return { name, tag, digest };
}

export function isOfficialPhp(img: ImageRef): boolean {
  return img.name === "php";
}

// Images known to bundle PHP. Matched on the repository name (prefix match for org/*).
export const BUNDLES_PHP = [
  "wordpress",
  "drupal",
  "joomla",
  "nextcloud",
  "matomo",
  "phpmyadmin",
  "phpmyadmin/phpmyadmin",
  "composer",
  "dunglas/frankenphp",
  "laravelsail/",
  "bitnami/php-fpm",
  "bitnami/wordpress",
  "bitnami/laravel",
  "serversideup/php",
  "webdevops/php",
  "thecodingmachine/php",
  "shinsenter/",
  "chialab/php",
];

export function bundlesPhp(img: ImageRef): boolean {
  if (isOfficialPhp(img)) return false;
  const last = img.name.split("/").pop() ?? img.name;
  return (
    BUNDLES_PHP.some((b) => (b.endsWith("/") ? img.name.startsWith(b) : img.name === b || img.name.startsWith(b + "-") || img.name.startsWith(b + ":"))) ||
    /php/.test(last)
  );
}

// Official php image tag: leading version (if any), then variant words, then an optional base OS suffix.
export interface OfficialTag {
  version: string | null; // "8.3.30", "8.3", "8", "8.5.0RC1"; null for "fpm", "latest", "cli" etc.
  osSuffix: string | null; // "bookworm", "alpine3.20", "bullseye"
}

export function parseOfficialTag(tag: string | null): OfficialTag {
  const t = (tag ?? "latest").toLowerCase();
  const m = /^(\d+(?:\.\d+){0,2}(?:-?(?:rc|beta|alpha)\d*)?)(?=$|-)/.exec(t);
  const os = /(?:^|-)((?:alpine\d+(?:\.\d+)?)|bookworm|trixie|bullseye|buster|stretch|jessie|windowsservercore[\w.-]*|nanoserver[\w.-]*)$/.exec(t);
  return { version: m ? m[1]! : null, osSuffix: os ? os[1]! : null };
}

export const OLD_BASE_OS = /^(buster|stretch|jessie|bullseye|alpine3\.(1\d)|alpine3\.[0-9])$/;

// PHP branch from a third-party image name or tag, e.g. "6.8-php8.2-apache", "laravelsail/php83-composer",
// "serversideup/php:8.3-fpm-nginx".
export function phpFromThirdParty(img: ImageRef): string | null {
  const hay = `${img.name}:${img.tag ?? ""}`;
  const m = /php[-_]?(\d)\.?(\d{1,2})(?!\d)/i.exec(hay);
  if (m) return `${m[1]}.${m[2]}`;
  const last = img.name.split("/").pop() ?? "";
  if (/php/.test(last) && img.tag) {
    const lead = /^(\d)\.(\d{1,2})(?:\.(\d+))?/.exec(img.tag);
    if (lead) return lead[0];
  }
  return null;
}
