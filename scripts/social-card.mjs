// Builds the GitHub social preview card (1280x640 PNG) from the real output on examples/demo-repo.
// Usage: node scripts/social-card.mjs <out.png>   (needs Google Chrome for the headless screenshot)
// The PNG is uploaded by hand in Settings > General > Social preview; it is not committed.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const out = resolve(process.argv[2] ?? "social-preview.png");
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
let json;
try {
  json = execFileSync("node", ["dist/src/cli.js", "examples/demo-repo", "--offline", "--json"], { encoding: "utf8" });
} catch (e) {
  json = e.stdout; // exit 1 is expected on the demo repo
}
const r = JSON.parse(json);
if (r.fixTable.status !== "published") throw new Error("fix table is not published; build the card after the release");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const pick = (bucket, n) => r.findings.filter((f) => f.bucket === bucket).slice(0, n);
const lines = [...pick("action", 2), ...pick("manual", 2)]
  .map((f) => `<div class="row"><span class="decl">${esc(f.declared)}</span><span class="reason ${f.bucket}">${esc(f.reason)}</span></div>`)
  .join("");

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:1280px;height:640px;background:#111418;color:#e8eaed;font-family:-apple-system,"Helvetica Neue",Arial,sans-serif}
  .safe{position:absolute;left:80px;top:60px;width:1120px;height:520px;display:flex;flex-direction:column}
  .mono{font-family:"SF Mono",Menlo,monospace}
  h1{font-size:60px;margin:0;font-weight:700;letter-spacing:-1px}
  .sub{font-size:32px;color:#b8bcc4;margin-top:14px;line-height:1.25}
  .cve{font-size:26px;color:#f0883e;margin-top:14px}
  .buckets{display:flex;gap:18px;margin-top:34px}
  .b{border-radius:10px;padding:12px 18px;font-size:24px;font-weight:700}
  .action{color:#ff6b6b}.manual{color:#f5d76e}.fixed{color:#5ad1e6}
  .b.action{background:#3a1d1f}.b.manual{background:#3a341d}.b.fixed{background:#1d3237}
  .rows{margin-top:22px;font-size:22px}
  .row{display:flex;gap:24px;padding:3px 0}.decl{width:430px}
  .foot{margin-top:auto;display:flex;flex-direction:column;gap:6px;font-size:22px;color:#9aa0a8}.foot span:first-child{color:#e8eaed}
</style></head><body><div class="safe">
  <h1 class="mono">php2shell-repo-audit</h1>
  <div class="sub">Which PHP versions do your repos declare, and which need the php2shell fix?</div>
  <div class="cve mono">CVE-2026-109618 · CVE-2026-109619</div>
  <div class="buckets mono">
    <div class="b action">ACTION REQUIRED ${r.counts.actionRequired}</div>
    <div class="b manual">CHECK MANUALLY ${r.counts.checkManually}</div>
    <div class="b fixed">DECLARED ≥ FIXED ${r.counts.declaredFixed}</div>
  </div>
  <div class="rows mono">${lines}</div>
  <div class="foot mono"><span>npx php2shell-repo-audit@${pkg.version} path/to/repo</span><span>Reads repo files. Doesn't check servers.</span></div>
</div></body></html>`;

const dir = mkdtempSync(join(tmpdir(), "p2s-card-"));
const page = join(dir, "card.html");
writeFileSync(page, html);
execFileSync("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
  "--window-size=1280,640", `--screenshot=${out}`, `file://${page}`,
], { stdio: "ignore" });
console.log(`wrote ${out} (demo repo: ${r.counts.actionRequired} / ${r.counts.checkManually} / ${r.counts.declaredFixed}, fix table rev ${r.fixTable.revision})`);
