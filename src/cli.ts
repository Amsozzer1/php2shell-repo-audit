#!/usr/bin/env node
// Release candidate stub. It exists so the npm name and the publish pipeline can be
// checked before php.net publishes fixed versions. It never reports on a repo.
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };

if (process.argv.includes("--version")) {
  console.log(pkg.version);
}
console.error(
  "php2shell-repo-audit " + pkg.version + ": not released yet: fixed versions are published at 14:00 UTC; " +
    "use the docker run one-liner meanwhile:\n" +
    "  docker run --rm --entrypoint php <image> -r 'echo PHP_VERSION;'",
);
process.exit(2);
