// Serves a recorded GitHub API fixture on localhost, for the demo tape and the end-to-end test.
// Usage: node scripts/mock-github.mjs <fixture.json> <port>   then GITHUB_API_URL=http://127.0.0.1:<port>
import { createServer } from "node:http";
import { readFileSync } from "node:fs";

const [fixturePath, port = "8765"] = process.argv.slice(2);
const fx = JSON.parse(readFileSync(fixturePath, "utf8"));
const base = `http://127.0.0.1:${port}`;
createServer((req, res) => {
  const route = fx.routes[req.url];
  if (!route) {
    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ message: "Not Found" }));
    return;
  }
  const headers = { "content-type": "application/json" };
  for (const [k, v] of Object.entries(route.headers ?? {})) headers[k] = String(v).replaceAll(fx.api, base);
  res.writeHead(route.status, headers);
  res.end(JSON.stringify(route.body));
}).listen(Number(port), "127.0.0.1", () => console.log(`mock GitHub API on ${base}`));
