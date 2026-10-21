// Shared types for declarations (what a detector found) and findings (declaration + verdict).

export type Context = "prod" | "ci" | "dev";

export type DeclKind =
  | "official-image" // php:<tag> from Docker Hub's official image, tag gives the version
  | "digest" // official php image pinned by @sha256
  | "build-arg" // official php image whose tag comes from an ARG / ${VAR:-x} default
  | "unresolved" // version comes from a variable or matrix we can't resolve
  | "third-party-image" // an image that bundles PHP but isn't the official php image
  | "distro" // apt/apk/dnf/yum php packages, ondrej PPA, remi
  | "sail" // Laravel Sail runtime (Ubuntu + ondrej packages)
  | "setup-php" // shivammathur/setup-php php-version
  | "php-version-file" // .php-version
  | "tool-versions" // .tool-versions (asdf)
  | "composer"; // composer.json require.php / config.platform.php

export interface Declaration {
  file: string; // path relative to the scanned root, forward slashes
  line: number; // 1-based
  text: string; // short display snippet, e.g. "FROM php:8.3-fpm"
  kind: DeclKind;
  context: Context;
  version: string | null; // raw version as declared ("8.3.30", "8.3", "latest", "^8.2"), or null
  note?: string; // extra detail for messages, e.g. the image name
}

export type Bucket = "action" | "manual" | "fixed";

export const REASONS = [
  "eol",
  "vulnerable",
  "declared-fixed",
  "not-affected",
  "pending-fix",
  "unknown-branch",
  "floating-rebuild",
  "build-arg",
  "unresolved",
  "digest",
  "third-party-image",
  "distro-vendor",
  "constraint-only",
] as const;

export type Reason = (typeof REASONS)[number];

export interface Finding extends Declaration {
  bucket: Bucket;
  reason: Reason;
  branch: string | null;
  message: string;
}

export interface BranchFix {
  fixed: string | null;
  affected?: boolean;
}

export interface FixTable {
  schemaVersion: 1;
  revision: number;
  cves: string[];
  status: "pending" | "published";
  publishedAt: string | null;
  source: string;
  verifiedAgainst: string;
  branches: Record<string, BranchFix>;
  eol: string[];
}
