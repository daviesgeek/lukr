import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { load } from "cheerio";
import puppeteer from "puppeteer";
import { MermaidRenderError, renderPlanDiagrams } from "../src/mermaid.js";

const source = `flowchart LR
  accTitle: Request flow
  accDescr: Browser to API to storage.
  Browser[Browser] --> API["API & Gateway"] --> DB[(Database)]
  class Browser frontend
  class API backend
  class DB database`;

const sequence = `sequenceDiagram
  accTitle: API request
  participant Client
  participant API
  Client->>API: Fetch data
  API-->>Client: Return result`;

function templateDocument() {
  const directory = mkdtempSync(join(tmpdir(), "lukr-template-"));
  try {
    const fragment = join(directory, "fragment.html");
    const output = join(directory, "plan.html");
    writeFileSync(fragment, `<header class="plan-header"><h1>Diagram review</h1><p class="lede">Review the request flow.</p></header>
<section><h2>Approach</h2><p><span class="semantic backend">Backend: API</span></p>
<figure class="diagram"><pre class="mermaid">${source.replaceAll("&", "&amp;")}</pre><figcaption>Request flow</figcaption></figure></section>
<section><h2>Implementation</h2><ol class="steps"><li><h3>Connect services</h3><p>Connect the API to storage.</p>
<details><summary>Implementation notes</summary><h3 id="commands">Commands</h3><pre><code>pnpm test</code></pre></details></li></ol></section>
<section><h2>Validation</h2><p>Check the saved document.</p>
<figure class="diagram"><pre class="mermaid">${sequence.replaceAll(">", "&gt;")}</pre><figcaption>API request sequence</figcaption></figure></section>`);
    execFileSync("python3", [resolve("skills/lukr-plan/scripts/render_plan.py"), fragment, "-o", output]);
    return readFileSync(output, "utf8");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("documents without Mermaid stay byte-for-byte unchanged", async () => {
  const html = '<!doctype html><html><head><title>Plain</title></head><body><pre><code>flowchart LR</code></pre></body></html>';
  assert.equal(await renderPlanDiagrams(html), html);
});

test("server-rendered SVGs, shared colors, reading depth, and theme variants", { timeout: 120_000 }, async (t) => {
  const original = templateDocument();
  const rendered = await renderPlanDiagrams(original);
  const $ = load(rendered);
  assert.ok(rendered.startsWith("<!doctype html>"));
  assert.equal($("[data-lukr-mermaid]").length, 2);
  assert.equal($(".mermaid-light svg").length, 2);
  assert.equal($(".mermaid-dark svg").length, 2);
  assert.equal($(".mermaid-source pre.mermaid").eq(0).text(), source);
  assert.equal($(".mermaid-source pre.mermaid").eq(1).text(), sequence);
  assert.equal($("#lukr-mermaid-styles").length, 1);
  assert.ok(rendered.includes("<!-- LUKR_VERSION_SELECTOR -->"));
  assert.ok(rendered.includes('<p>Connect the API to storage.</p>'));
  const svgIds = $("svg [id], svg[id]").toArray().map(node => $(node).attr("id"));
  assert.equal(new Set(svgIds).size, svgIds.length, "SVG IDs must not collide across themes");
  assert.equal($("script[src]").length, 0, "Saved documents need no external runtime");

  await t.test("resubmitting retained source replaces diagrams without nested wrappers", async () => {
    const rerendered = load(await renderPlanDiagrams(rendered));
    assert.equal(rerendered("[data-lukr-mermaid]").length, 2);
    assert.equal(rerendered("svg").length, 4);
    assert.equal(rerendered("#lukr-mermaid-styles").length, 1);
    assert.equal(rerendered(".mermaid-source pre.mermaid").eq(0).text(), source);
    assert.equal(rerendered(".mermaid-source pre.mermaid").eq(1).text(), sequence);
  });

  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: process.env.PUPPETEER_NO_SANDBOX === "true" ? ["--no-sandbox"] : [],
  });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    await page.setViewport({ width: 1280, height: 900 });
    await page.setContent(rendered);

    await t.test("diagram role colors match the shared HTML tokens", async () => {
      for (const theme of ["light", "dark"]) {
        await page.select("#theme-select", theme);
        const colors = await page.evaluate(theme => {
          const rect = document.querySelector(`.mermaid-${theme} .node.backend rect`)!;
          const badge = document.querySelector(".semantic.backend")!;
          return {
            diagram: getComputedStyle(rect).fill,
            badge: getComputedStyle(badge).backgroundColor,
          };
        }, theme);
        assert.equal(colors.diagram, colors.badge);
        assert.notEqual(colors.diagram, "rgb(0, 0, 0)");
      }
    });

    await t.test("manual theme switches select the embedded SVG without Mermaid", async () => {
      await page.select("#theme-select", "dark");
      assert.equal(await page.$eval(".mermaid-dark", el => getComputedStyle(el).display), "block");
      assert.equal(await page.$eval(".mermaid-light", el => getComputedStyle(el).display), "none");
      await page.select("#theme-select", "light");
      assert.equal(await page.$eval(".mermaid-light", el => getComputedStyle(el).display), "block");
      assert.equal(await page.$eval(".mermaid-dark", el => getComputedStyle(el).display), "none");
    });

    await t.test("reading-depth controls work with individual disclosures and navigation", async () => {
      assert.equal(await page.$eval("#collapse-all", el => el.getAttribute("aria-pressed")), "true");
      await page.click("#expand-all");
      assert.equal(await page.$$eval("#plan-content details:not(.mobile-toc details)", elements => elements.every(el => (el as HTMLDetailsElement).open)), true);
      assert.equal(await page.$eval("#expand-all", el => el.getAttribute("aria-pressed")), "true");
      await page.click("#collapse-all");
      await page.click('#desktop-toc a[href="#commands"]');
      assert.equal(await page.$eval("#commands", el => (el.closest("details") as HTMLDetailsElement).open), true);
      await page.waitForFunction(() =>
        document.querySelector("#expand-all")?.getAttribute("aria-pressed") === "false" &&
        document.querySelector("#collapse-all")?.getAttribute("aria-pressed") === "false",
      );
      assert.equal(await page.$eval("#collapse-all", el => el.getAttribute("aria-pressed")), "false");
      assert.equal(await page.evaluate(() => document.activeElement?.id), "commands");
    });

    await t.test("desktop and mobile keep diagrams inside horizontal scroll regions", async () => {
      for (const width of [1280, 390]) {
        await page.setViewport({ width, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      }
      assert.equal(await page.$eval("#desktop-toc", el => getComputedStyle(el).display), "none");
      assert.equal(await page.$eval("#mobile-toc", el => getComputedStyle(el).display), "block");
      await page.click("#collapse-all");
      await page.click("#mobile-toc summary");
      await page.click('#mobile-toc a[href="#commands"]');
      assert.equal(await page.$eval("#mobile-toc details", el => (el as HTMLDetailsElement).open), false);
      assert.equal(await page.$eval("#commands", el => (el.closest("details") as HTMLDetailsElement).open), true);
    });

    await t.test("short plans reclaim the navigation column", async () => {
      const short = original.replace("<h2>Validation</h2>", "<h3>Validation</h3>");
      await page.setViewport({ width: 1280, height: 900 });
      await page.setContent(short);
      assert.equal(await page.$eval(".layout", el => el.classList.contains("has-toc")), false);
      assert.equal(await page.$eval("#desktop-toc", el => getComputedStyle(el).display), "none");
      await page.setViewport({ width: 390, height: 900 });
      assert.equal(await page.$eval("#mobile-toc", el => getComputedStyle(el).display), "none");
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test("invalid Mermaid identifies the failing diagram", { timeout: 60_000 }, async () => {
  await assert.rejects(
    renderPlanDiagrams(`<html><head></head><body><pre class="mermaid">${source.replaceAll("&", "&amp;")}</pre><pre class="mermaid">not a diagram</pre></body></html>`),
    error => error instanceof MermaidRenderError && error.status === 422 && error.diagram === 2,
  );
});

test("unavailable browser produces an availability error", async () => {
  const previous = process.env.PUPPETEER_EXECUTABLE_PATH;
  process.env.PUPPETEER_EXECUTABLE_PATH = resolve(".cache/missing-browser");
  try {
    await assert.rejects(
      renderPlanDiagrams('<pre class="mermaid">flowchart LR\n A --> B</pre>'),
      error => error instanceof MermaidRenderError && error.status === 503,
    );
  } finally {
    if (previous === undefined) delete process.env.PUPPETEER_EXECUTABLE_PATH;
    else process.env.PUPPETEER_EXECUTABLE_PATH = previous;
  }
});
