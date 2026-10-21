import { test } from "node:test";
import assert from "node:assert/strict";
import { detectDockerfile, isDockerfile } from "../src/detectors/docker.js";
import { detectYaml } from "../src/detectors/yaml.js";
import { detectComposer, detectVersionFile } from "../src/detectors/files.js";
import { scan } from "../src/scan.js";
import { classify } from "../src/verdict.js";
import type { Declaration } from "../src/types.js";
import { REPO_ROOT, table } from "./helpers.js";

const brief = (ds: Declaration[]) => ds.map((d) => [d.line, d.kind, d.version]);

test("Dockerfile file names", () => {
  for (const n of ["Dockerfile", "docker/Dockerfile.prod", "app.Dockerfile", "Containerfile"]) assert.ok(isDockerfile(n), n);
  assert.ok(!isDockerfile("docs/dockerfile-notes.md"));
});

test("multi-stage Dockerfile skips stage references", () => {
  const ds = detectDockerfile("Dockerfile", ["FROM php:8.3.30-cli AS base", "RUN echo", "FROM base AS final", "FROM node:22 AS assets"].join("\n"));
  assert.deepEqual(brief(ds), [[1, "official-image", "8.3.30"]]);
});

test("FROM --platform and registry prefixes", () => {
  const ds = detectDockerfile("Dockerfile", "FROM --platform=$BUILDPLATFORM php:8.3 AS base\nFROM docker.io/library/php:8.2.34-cli\n");
  assert.deepEqual(brief(ds), [[1, "official-image", "8.3"], [2, "official-image", "8.2.34"]]);
});

test("global ARG default and ${VAR:-x} become build-arg", () => {
  const a = detectDockerfile("Dockerfile", "ARG PHP_VERSION=8.3\nFROM php:${PHP_VERSION}-fpm\n");
  assert.deepEqual(brief(a), [[2, "build-arg", "8.3"]]);
  const b = detectDockerfile("Dockerfile", "FROM php:${PHP_VERSION:-8.3}-fpm-alpine\n");
  assert.deepEqual(brief(b), [[1, "build-arg", "8.3"]]);
  const c = detectDockerfile("Dockerfile", "FROM php:${PHP_VERSION}-fpm\n");
  assert.deepEqual(brief(c), [[1, "unresolved", null]]);
  // A stage-level ARG is not visible to FROM.
  const d = detectDockerfile("Dockerfile", "FROM alpine\nARG PHP_VERSION=8.3\nFROM php:${PHP_VERSION}\n");
  assert.deepEqual(brief(d), [[3, "unresolved", null]]);
});

test("digest pins and base OS suffixes", () => {
  const ds = detectDockerfile("Dockerfile", "FROM php@sha256:0123abcd\nFROM php:8.3-fpm-bullseye\n");
  assert.deepEqual(brief(ds), [[1, "digest", "latest"], [2, "official-image", "8.3"]]);
  assert.equal(ds[1]!.note, "bullseye");
});

test("images that bundle PHP", () => {
  const ds = detectDockerfile(
    "Dockerfile",
    ["FROM bitnami/php-fpm:8.2", "FROM wordpress:6.8-php8.2-apache", "FROM dunglas/frankenphp:1-php8.3", "FROM serversideup/php:8.4-fpm-nginx", "FROM debian:bookworm"].join("\n"),
  );
  assert.deepEqual(brief(ds), [[1, "third-party-image", "8.2"], [2, "third-party-image", "8.2"], [3, "third-party-image", "8.3"], [4, "third-party-image", "8.4"]]);
});

test("apt-get install continued over lines, versionless and apk packages", () => {
  const a = detectDockerfile("Dockerfile", "FROM ubuntu:24.04\nRUN apt-get update && apt-get install -y \\\n    curl \\\n    php8.3-fpm php8.3-mysql \\\n    && rm -rf /var/lib/apt/lists/*\n");
  assert.deepEqual(brief(a), [[4, "distro", "8.3"]]);
  const b = detectDockerfile("Dockerfile", "FROM debian:bookworm\nRUN apt-get install -y php-fpm php-cli\n");
  assert.deepEqual(brief(b), [[2, "distro", null]]);
  const c = detectDockerfile("Dockerfile", "FROM alpine:3.20\nRUN apk add --no-cache php83 php83-fpm\n");
  assert.deepEqual(brief(c), [[2, "distro", "8.3"]]);
  const d = detectDockerfile("Dockerfile", "FROM rockylinux:9\nRUN dnf -y module enable php:remi-8.3 && dnf -y install php-fpm\n");
  assert.deepEqual(brief(d).map((x) => x[2]).sort(), [null, "8.3"].sort());
  const e = detectDockerfile("Dockerfile", "FROM php:8.3\nRUN apt-get install -y libzip-dev && echo phpunit\n");
  assert.deepEqual(brief(e), [[1, "official-image", "8.3"]]);
});

test("YAML image lines: compose, k8s, GH Actions container, GitLab name", () => {
  const compose = detectYaml("docker-compose.yml", "services:\n  app:\n    image: php:8.3-fpm\n  db:\n    image: mysql:8\n  x:\n    image: ${PHP_IMAGE:-php:8.3}\n");
  assert.deepEqual(brief(compose), [[3, "official-image", "8.3"], [7, "build-arg", "8.3"]]);
  assert.equal(compose[0]!.context, "prod");
  const gha = detectYaml(".github/workflows/ci.yml", "jobs:\n  a:\n    container: php:8.3\n  b:\n    container:\n      image: php:8.2.34-cli\n");
  assert.deepEqual(brief(gha), [[3, "official-image", "8.3"], [6, "official-image", "8.2.34"]]);
  assert.equal(gha[0]!.context, "ci");
  const gitlab = detectYaml(".gitlab-ci.yml", "test:\n  image:\n    name: php:8.4\n    entrypoint: ['']\n");
  assert.deepEqual(brief(gitlab), [[3, "official-image", "8.4"]]);
});

test("Laravel Sail runtime in compose", () => {
  const ds = detectYaml("docker-compose.yml", "services:\n  laravel.test:\n    build:\n      context: ./vendor/laravel/sail/runtimes/8.4\n    image: sail-8.4/app\n");
  assert.deepEqual(brief(ds), [[4, "sail", "8.4"]]);
  assert.equal(ds[0]!.context, "dev");
});

test("setup-php: scalar, flow matrix, block matrix with include, unresolvable matrix", () => {
  const scalar = detectYaml(".github/workflows/ci.yml", "    steps:\n      - uses: shivammathur/setup-php@v2\n        with:\n          php-version: '8.3'\n");
  assert.deepEqual(brief(scalar), [[4, "setup-php", "8.3"]]);
  const flow = detectYaml(
    ".github/workflows/ci.yml",
    "jobs:\n  t:\n    strategy:\n      matrix:\n        php: ['8.2', '8.3']\n    steps:\n      - name: PHP\n        uses: shivammathur/setup-php@v2\n        with:\n          php-version: ${{ matrix.php }}\n",
  );
  assert.deepEqual(brief(flow), [[5, "setup-php", "8.2"], [5, "setup-php", "8.3"]]);
  const block = detectYaml(
    ".github/workflows/ci.yml",
    "jobs:\n  t:\n    strategy:\n      matrix:\n        php-versions:\n          - '8.3'\n          - 8.4\n        include:\n          - php-versions: '8.5'\n    steps:\n      - uses: shivammathur/setup-php@v2\n        with:\n          php-version: ${{ matrix.php-versions }}\n",
  );
  assert.deepEqual(brief(block), [[6, "setup-php", "8.3"], [7, "setup-php", "8.4"], [9, "setup-php", "8.5"]]);
  const json = detectYaml(
    ".github/workflows/ci.yml",
    "jobs:\n  t:\n    strategy:\n      matrix:\n        php: ${{ fromJSON(needs.x.outputs.v) }}\n    steps:\n      - uses: shivammathur/setup-php@v2\n        with:\n          php-version: ${{ matrix.php }}\n",
  );
  assert.deepEqual(brief(json), [[9, "unresolved", null]]);
});

test(".php-version and .tool-versions", () => {
  assert.deepEqual(brief(detectVersionFile(".php-version", "8.3.12\n")), [[1, "php-version-file", "8.3.12"]]);
  assert.deepEqual(brief(detectVersionFile("app/.tool-versions", "nodejs 22.11.0\nphp 8.4.20\nruby 3.3.0\n")), [[2, "tool-versions", "8.4.20"]]);
});

test("composer require.php and config.platform.php, not require-dev", () => {
  const json = '{\n  "require": {\n    "php": "^8.2",\n    "laravel/framework": "^11"\n  },\n  "require-dev": {\n    "php": ">=8.1"\n  },\n  "config": {\n    "platform": {\n      "php": "8.2.20"\n    }\n  }\n}\n';
  assert.deepEqual(brief(detectComposer("composer.json", json)), [[3, "composer", "^8.2"], [11, "composer", "8.2.20"]]);
});

test("demo repo: all 7 planted declarations with the expected buckets", () => {
  const r = scan(`${REPO_ROOT}examples/demo-repo`);
  assert.equal(r.declarations.length, 7);
  const got = r.declarations.map((d) => {
    const f = classify(d, table("pending"));
    return `${d.file}:${d.line} ${d.kind} ${d.context} ${f.bucket}/${f.reason}`;
  });
  assert.deepEqual(got, [
    ".github/workflows/ci.yml:10 setup-php ci manual/floating-rebuild",
    ".tool-versions:2 tool-versions dev manual/pending-fix",
    "Dockerfile:1 official-image prod manual/floating-rebuild",
    "composer.json:6 composer prod manual/constraint-only",
    "docker/api/Dockerfile:1 official-image prod manual/pending-fix",
    "docker/legacy/Dockerfile:1 official-image prod action/eol",
    "docker/worker/Dockerfile:3 distro prod manual/distro-vendor",
  ]);
});

test("Dockerfile-* names, and PHP packages built by a subshell", () => {
  assert.ok(isDockerfile("scripts/docker/Dockerfile-fpm"));
  const ds = detectDockerfile(
    "Dockerfile",
    'FROM ubuntu:24.04\nRUN if [ -n "$PHP_EXTENSIONS" ]; then \\\n    apt-get install -y $(for ext in $PHP_EXTENSIONS; do echo "php8.4-$ext"; done) \\\n    ; fi\n',
  );
  assert.deepEqual(brief(ds), [[3, "distro", "8.4"]]);
});

test("setup-php matrix: exclude entries are not declarations", () => {
  const ds = detectYaml(
    ".github/workflows/ci.yml",
    "jobs:\n  t:\n    strategy:\n      matrix:\n        php: [8.2, 8.3]\n        laravel: [12, 13]\n        exclude:\n          - php: 8.2\n            laravel: 13\n    steps:\n      - uses: shivammathur/setup-php@v2\n        with:\n          php-version: ${{ matrix.php }}\n",
  );
  assert.deepEqual(brief(ds), [[5, "setup-php", "8.2"], [5, "setup-php", "8.3"]]);
});

test("setup-php reading ${{ env.X }} reports the env value line", () => {
  const ds = detectYaml(
    ".github/workflows/release.yml",
    "env:\n  php-version: '8.3'\njobs:\n  r:\n    steps:\n      - uses: shivammathur/setup-php@v2\n        with:\n          php-version: ${{ env.php-version }}\n",
  );
  assert.deepEqual(brief(ds), [[2, "setup-php", "8.3"]]);
});

test("PHP version inputs passed to a reusable workflow", () => {
  const ds = detectYaml(
    ".github/workflows/tests.yml",
    "jobs:\n  tests:\n    uses: org/workflows/.github/workflows/laravel.yml@v2\n    with:\n      php-versions: \"['8.3', '8.4']\"\n      connections: \"['sqlite']\"\n      default-php-version: '8.3'\n",
  );
  assert.deepEqual(brief(ds), [[5, "setup-php", "8.3"], [5, "setup-php", "8.4"], [7, "setup-php", "8.3"]]);
});

test("held-out gaps: setup-php by URL, libapache2-mod-php, pacman, Forgejo workflows", () => {
  const url = detectYaml(".forgejo/workflows/lint.yml", "    steps:\n    - uses: https://github.com/shivammathur/setup-php@v2\n      with:\n        php-version: 8.4\n");
  assert.deepEqual(brief(url), [[4, "setup-php", "8.4"]]);
  assert.equal(url[0]!.context, "ci");
  const mod = detectDockerfile("Dockerfile", "FROM debian:trixie\nRUN apt-get install -y \\\n  apache2 libapache2-mod-php \\\n  php-curl\n");
  assert.deepEqual(brief(mod), [[3, "distro", null]]);
  const arch = detectDockerfile("Dockerfile", "FROM archlinux\nRUN pacman -Syu --noconfirm && pacman -S --noconfirm \\\n  apache php-apache\n");
  assert.deepEqual(brief(arch), [[3, "distro", null]]);
});
