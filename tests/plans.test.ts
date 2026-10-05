import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { load } from "cheerio";
import { publishing } from "../src/publishing.js";

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
    assert.match(await (await fetch(server.base + "/plans")).text(), /No plans yet/);

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
    assert.match(await (await fetch(server.base + "/plans")).text(), /No plans yet/);
  } finally {
    await server.stop();
  }
});

test("both library routes show a collapsed publishing guide and useful empty state", async () => {
  const server = await startServer();
  try {
    const responses = await Promise.all(["/", "/plans", "/?page=900"].map(async path => {
      const response = await fetch(server.base + path);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type")!, /text\/html/);
      return await response.text();
    }));
    assert.equal(responses[0], responses[1]);
    for (const html of responses) {
      const $ = load(html);
      assert.equal($("title").text(), "Plans | Lukr");
      assert.equal($("main h1").text(), "Plans");
      assert.equal($(".empty h2").text(), "No plans yet");
      assert.equal($(".pagination").length, 0);
      assert.equal($(".publishing").is("details"), true);
      assert.equal($(".publishing").attr("open"), undefined);
      assert.equal($(".publishing > summary").text(), "Save a plan");
      assert.ok(html.indexOf('class="publishing"') < html.indexOf('class="empty"'));
      assert.equal($(".publishing a").attr("href"), "/llms.txt");
      assert.equal($(".publishing pre code").text(), publishing.configuration);
      assert.deepEqual(JSON.parse($(".publishing pre code").text()), { lukrUrl: "https://YOUR-LUKR-SERVER" });
      assert.deepEqual($("#theme-select option").map((_, el) => $(el).attr("value")).get(), ["system", "light", "dark"]);
      assert.match(html, /localStorage.getItem\('plan-theme'\)/);
      assert.equal($(".skip-link").attr("href"), "#library-content");
    }
    const guideResponse = await fetch(server.base + "/llms.txt");
    assert.equal(guideResponse.status, 200);
    assert.match(guideResponse.headers.get("content-type")!, /text\/plain; charset=utf-8/);
    const guide = await guideResponse.text();
    for (const example of [publishing.configuration, publishing.request, publishing.response]) assert.ok(guide.includes(example));
    for (const endpoint of publishing.endpoints) {
      assert.ok(guide.includes(endpoint.path));
      assert.ok(load(responses[0])(".publishing").text().includes(endpoint.path));
    }
    assert.match(guide, /Base-URL placeholder/);
    assert.match(guide, /Revisions append a new version/);
    assert.match(guide, /returned id and version/);
  } finally { await server.stop(); }
});

test("library pagination, stable ordering, latest names and dated collapsed histories", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lukr-library-"));
  const databasePath = join(directory, "test.db");
  const server = await startServer({ LUKR_DB_PATH: databasePath });
  const db = new DatabaseSync(databasePath);
  try {
    const insert = db.prepare("INSERT INTO plans (id, name, version, html, created_at) VALUES (?, ?, ?, ?, ?)");
    const ids = Array.from({ length: 51 }, (_, index) => `plan-${String(index).padStart(3, "0")}`);
    // Reverse insertion order proves ties are ordered by ID, not insertion order.
    for (const id of [...ids].reverse()) insert.run(id, "Duplicate title", 1, "<h1>Stored private inventory</h1>", "2026-10-04 14:30:00");
    insert.run(ids[50], "Latest name", 2, "<h1>Latest</h1>", "2026-10-05 09:10:00");
    insert.run(ids[50], "", 3, "<h1>Latest, earlier timestamp</h1>", "2026-10-04 18:10:00");
    insert.run(ids[0], "Renamed plan", 2, "<h1>Renamed</h1>", "2026-10-03 12:00:00");
    const ordered = [ids[50], ...ids.slice(0, 50)];
    const get = async (path: string) => load(await (await fetch(server.base + path)).text());
    for (const route of ["/", "/plans"]) {
      const first = await get(route);
      assert.equal(first(".range").text(), "1–25 of 51 plans");
      assert.equal(first(".plan-row").length, 25);
      assert.deepEqual(first(".plan-title").map((_, el) => first(el).attr("href")).get(), ordered.slice(0, 25).map(id => `/plans/${id}`));
      assert.equal(first(".pagination [rel=prev]").length, 0);
      assert.equal(first(".pagination [rel=next]").attr("href"), "?page=2");
      assert.equal(first(".plan-title").first().text(), "Untitled plan");
      assert.equal(first(".plan-title").eq(1).text(), "Renamed plan");
      const row = first(".plan-row").first();
      assert.equal(row.find("summary").text(), "Version history · 3 versions");
      assert.equal(row.find("details").attr("open"), undefined);
      assert.equal(row.find(".plan-id").closest("details").length, 1);
      assert.equal(row.find("h3").text().includes(ids[50]), false);
      assert.deepEqual(row.find(".history a").map((_, el) => first(el).attr("href")).get(), [3, 2, 1].map(version => `/plans/${ids[50]}/${version}`));
      assert.equal(row.find(".history a").first().text(), "Version 3, latest");
      assert.equal(row.find(".metadata time").attr("datetime"), "2026-10-05T09:10:00.000Z");
      assert.equal(row.find(".history time").first().text(), "4 Oct 2026, 18:10 UTC");
      assert.equal(row.find(".history time").eq(1).attr("datetime"), "2026-10-05T09:10:00.000Z");
      const second = await get(route + "?page=2");
      assert.equal(second(".range").text(), "26–50 of 51 plans");
      assert.equal(second(".plan-row").length, 25);
      assert.ok(second(".publishing").length);
      assert.equal(second(".pagination [rel=prev]").attr("href"), "?page=1");
      assert.equal(second(".pagination [rel=next]").attr("href"), "?page=3");
      assert.deepEqual(second(".plan-title").map((_, el) => second(el).attr("href")).get(), ordered.slice(25, 50).map(id => `/plans/${id}`));
      for (const value of ["3", "4", "9999999999999999999999999999"]) {
        const last = await get(route + "?page=" + value);
        assert.equal(last(".range").text(), "51–51 of 51 plans");
        assert.equal(last(".plan-row").length, 1);
        assert.equal(last(".page-position").text(), "Page 3 of 3");
        assert.equal(last(".pagination [rel=next]").length, 0);
      }
      for (const value of ["", "0", "-1", "abc", "2abc", "1.5", "01", "2&page=3", "2e1", "Infinity"]) {
        const invalidPage = await get(route + "?page=" + value);
        assert.equal(invalidPage(".range").text(), "1–25 of 51 plans", value);
      }
    }
    const guide = await (await fetch(server.base + "/llms.txt")).text();
    assert.ok(!guide.includes("Stored private inventory"));
    assert.ok(!guide.includes(ids[0]));
    // One plan beyond the boundary gets its own page.
    db.prepare("DELETE FROM plans WHERE id >= ?").run(ids[26]);
    const overBoundary = await get("/?page=2");
    assert.equal(overBoundary(".range").text(), "26–26 of 26 plans");
    assert.equal(overBoundary(".plan-row").length, 1);
    assert.equal(overBoundary(".pagination [rel=next]").length, 0);
    // Exactly one full page has no Next link and counts plans, not versions.
    db.prepare("DELETE FROM plans WHERE id >= ?").run(ids[25]);
    const boundary = await get("/?page=2");
    assert.equal(boundary(".range").text(), "1–25 of 25 plans");
    assert.equal(boundary(".pagination [rel=next]").length, 0);
    db.exec("DROP TABLE plans");
    const failure = await fetch(server.base + "/plans?page=2");
    assert.equal(failure.status, 500);
    const failed = load(await failure.text());
    assert.equal(failed(".empty h2").text(), "Couldn't load plans");
    assert.equal(failed(".empty a").text(), "Reload plans");
    assert.equal(failed(".toolbar #theme-select").length, 1);
    assert.equal(failed(".publishing a").attr("href"), "/llms.txt");
    assert.equal((await fetch(server.base + "/llms.txt")).status, 200);
  } finally {
    db.close();
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

test("canonical slot and older documents get one serve-time navigation control on both version routes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lukr-navigation-"));
  const databasePath = join(directory, "test.db");
  const server = await startServer({ LUKR_DB_PATH: databasePath });
  const db = new DatabaseSync(databasePath);
  try {
    const template = await readFile("skills/lukr-plan/assets/template.html", "utf8");
    const canonical = template.replace("<!-- PLAN_CONTENT -->", "<h1>Canonical document</h1>");
    const old = "<!doctype html><html><head><title>Old</title></head><body><h1>Older document</h1></body></html>";
    const insert = db.prepare("INSERT INTO plans (id, name, version, html) VALUES (?, ?, ?, ?)");
    for (const [id, html] of [["canonical", canonical], ["old", old], ["fragment", "<h1>Fragment</h1>"]]) {
      insert.run(id, id, 1, html);
      insert.run(id, id, 2, html);
      for (const suffix of ["", "/1", "/2"]) {
        const response = await fetch(`${server.base}/plans/${id}${suffix}`);
        assert.equal(response.status, 200);
        const document = await response.text();
        const $ = load(document);
        assert.equal($("#version-select").length, 1);
        assert.equal($("#version-select option").length, 2);
        assert.equal($("#version-select option[selected]").attr("value"), suffix === "/1" ? "1" : "2");
        assert.equal($("a[href='/']").text(), "All plans");
        assert.ok(document.includes(`window.location.href = '/plans/${id}/' + version`));
        if (id === "canonical") {
          assert.equal($(".toolbar #lukr-version-slot #version-select").length, 1);
          assert.equal($(".toolbar #lukr-version-slot a[href='/']").length, 1);
          assert.ok(document.startsWith("<!doctype html>"));
        } else {
          assert.equal($("nav[aria-label='Plan navigation'] #version-select").length, 1);
          assert.equal($("nav[aria-label='Plan navigation'] a[href='/']").length, 1);
        }
      }
      assert.equal((db.prepare("SELECT html FROM plans WHERE id = ? AND version = 1").get(id) as { html: string }).html, html);
    }
    assert.equal((await fetch(server.base + "/plans/canonical/3")).status, 404);
    assert.equal((await fetch(server.base + "/plans/missing")).status, 404);
  } finally {
    db.close();
    await server.stop();
    await rm(directory, { recursive: true, force: true });
  }
});
