import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import test from "node:test";
import { load } from "cheerio";

async function startServer(extraEnvironment: Record<string, string> = {}) {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  const port = address.port;
  await new Promise<void>(resolve => listener.close(() => resolve()));
  const server = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
    env: { ...process.env, PORT: String(port), LUKR_DB_PATH: ":memory:", ...extraEnvironment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  server.stderr.on("data", chunk => output += chunk);
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server startup timed out: ${output}`)), 15_000);
      server.once("error", error => { clearTimeout(timer); reject(error); });
      server.once("exit", code => { clearTimeout(timer); reject(new Error(`Server exited ${code}: ${output}`)); });
      server.stdout.on("data", chunk => {
        output += chunk;
        if (output.includes("Server is running")) { clearTimeout(timer); resolve(); }
      });
    });
  } catch (error) {
    server.kill("SIGTERM");
    throw error;
  }
  return {
    base: `http://127.0.0.1:${port}`,
    async stop() {
      const exited = once(server, "exit");
      server.kill("SIGTERM");
      await exited;
    },
  };
}

const post = (base: string, path: string, html: string) => fetch(base + path, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "Request flow", html }),
});

const valid = '<!doctype html><html data-theme="system"><head><title>Plan</title></head><body><h1>Request flow</h1><pre class="mermaid">flowchart LR\n A[Browser] --> B[API]\n class A frontend\n class B backend</pre></body></html>';
const invalid = '<html><head></head><body><pre class="mermaid">not a diagram</pre></body></html>';

test("save-time diagrams and failed saves preserve version history", { timeout: 120_000 }, async () => {
  const server = await startServer();
  try {
    const rejected = await post(server.base, "/plans", invalid);
    assert.equal(rejected.status, 422);
    assert.equal((await rejected.json()).diagram, 1);
    assert.match(await (await fetch(server.base + "/plans")).text(), /No plans found/);

    const saved = await post(server.base, "/plans", valid);
    assert.equal(saved.status, 201);
    const plan = await saved.json();
    assert.equal(plan.version, 1);
    const served = await (await fetch(`${server.base}/plans/${plan.id}/1`)).text();
    const $ = load(served);
    assert.equal($("svg").length, 2);
    assert.equal($(".mermaid-source pre.mermaid").length, 1);
    assert.equal($("#version-select option").length, 1);

    const failedRevision = await post(server.base, `/plans/${plan.id}`, invalid);
    assert.equal(failedRevision.status, 422);
    const latest = load(await (await fetch(`${server.base}/plans/${plan.id}`)).text());
    assert.equal(latest("#version-select option").length, 1);
    assert.equal(latest("svg").length, 2);
    assert.equal((await fetch(`${server.base}/plans/${plan.id}/2`)).status, 404);

    const revised = await post(server.base, `/plans/${plan.id}`, '<html><body><h1>Revised plan</h1></body></html>');
    assert.equal(revised.status, 201);
    assert.equal((await revised.json()).version, 2);
    const old = await (await fetch(`${server.base}/plans/${plan.id}/1`)).text();
    assert.equal(load(old)("svg").length, 2, "previous versions retain their SVGs");
    assert.equal((await post(server.base, "/plans/missing", invalid)).status, 404);
  } finally {
    await server.stop();
  }
});

test("renderer unavailability returns 503 and stores nothing", { timeout: 30_000 }, async () => {
  const server = await startServer({ PUPPETEER_EXECUTABLE_PATH: "/missing/lukr-browser" });
  try {
    const response = await post(server.base, "/plans", valid);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).diagram, 1);
    assert.match(await (await fetch(server.base + "/plans")).text(), /No plans found/);
  } finally {
    await server.stop();
  }
});
