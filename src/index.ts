import { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import express from "express";
import { MermaidRenderError, renderPlanDiagrams } from "./mermaid.js";
import { libraryPage, PAGE_SIZE, renderLibrary, type LibraryPlan, type PlanHistory } from "./library.js";
import { renderPublishingText } from "./publishing.js";

const databasePath = process.env.LUKR_DB_PATH?.trim() || "app.db";

if (databasePath !== ":memory:") {
  mkdirSync(dirname(databasePath), { recursive: true });
}

const db = new DatabaseSync(databasePath);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS plans (
    id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL,
    html TEXT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, version)
  )
`);

interface Plan {
  id: string;
  name: string;
  version: number;
  html: string;
  created_at: string;
}

const isPlan = (value: unknown): value is Plan => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const plan = value as Record<string, SQLOutputValue>;

  return (
    typeof plan.id === "string" &&
    typeof plan.name === "string" &&
    typeof plan.version === "number" &&
    typeof plan.html === "string" &&
    typeof plan.created_at === "string"
  );
};

const app = express();
app.use(express.json());

app.get(["/", "/plans"], (req, res) => {
  try {
    const { total } = db.prepare("SELECT COUNT(DISTINCT id) AS total FROM plans").get() as { total: number };
    const page = libraryPage(req.query.page, total);
    const rows = db.prepare(`
      SELECT grouped.id, latest.name, grouped.version, grouped.updated_at
      FROM (SELECT id, MAX(version) AS version, MAX(created_at) AS updated_at FROM plans GROUP BY id) grouped
      JOIN plans latest ON latest.id = grouped.id AND latest.version = grouped.version
      ORDER BY grouped.updated_at DESC, grouped.id ASC
      LIMIT ? OFFSET ?
    `).all(PAGE_SIZE, (page - 1) * PAGE_SIZE) as unknown as Omit<LibraryPlan, "history">[];
    const histories = new Map<string, PlanHistory[]>();
    if (rows.length) {
      const entries = db.prepare(`SELECT id, version, created_at FROM plans WHERE id IN (${rows.map(() => "?").join(",")}) ORDER BY id ASC, version DESC`)
        .all(...rows.map(row => row.id)) as unknown as (PlanHistory & { id: string })[];
      for (const entry of entries) {
        const history = histories.get(entry.id) ?? [];
        history.push(entry);
        histories.set(entry.id, history);
      }
    }
    res.type("html").send(renderLibrary(rows.map(row => ({ ...row, history: histories.get(row.id) ?? [] })), total, page));
  } catch (error) {
    console.error("Couldn't load plans", error);
    res.status(500).type("html").send(renderLibrary([], 0, 1, true));
  }
});

app.get("/llms.txt", (_req, res) => res.type("text/plain").send(renderPublishingText()));

app.post("/plans", async (req, res) => {
  let html =
    req.body && typeof req.body.html === "string" ? req.body.html.trim() : "";
  if (typeof html !== "string" || html.length === 0) {
    return res.status(400).json({ error: "Missing html" });
  }

  try {
    html = await renderPlanDiagrams(html);
  } catch (error) {
    if (error instanceof MermaidRenderError) {
      return res.status(error.status).json({ error: "Mermaid rendering failed", diagram: error.diagram, detail: error.message });
    }
    throw error;
  }

  const UUID = randomUUID();
  const name =
    req.body && typeof req.body.name === "string" ? req.body.name.trim() : "";

  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare(
      "INSERT INTO plans (id, name, version, html) VALUES (?, ?, ?, ?)",
    ).run(UUID, name, 1, html);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  res.status(201).json({ id: UUID, version: 1, name });
});

app.post("/plans/:planId", async (req, res) => {
  const { planId } = req.params;

  let html =
    req.body && typeof req.body.html === "string" ? req.body.html.trim() : "";
  if (typeof html !== "string" || html.length === 0) {
    return res.status(400).json({ error: "Missing html" });
  }

  if (!db.prepare("SELECT 1 FROM plans WHERE id = ?").get(planId)) {
    return res.status(404).json({ error: "Plan not found" });
  }

  try {
    html = await renderPlanDiagrams(html);
  } catch (error) {
    if (error instanceof MermaidRenderError) {
      return res.status(error.status).json({ error: "Mermaid rendering failed", diagram: error.diagram, detail: error.message });
    }
    throw error;
  }

  db.exec("BEGIN IMMEDIATE");
  let newVersion: number;
  let name: string;
  try {
    const latestPlan = db
      .prepare("SELECT * FROM plans WHERE id = ? ORDER BY version DESC LIMIT 1")
      .get(planId) as { version?: unknown; name?: unknown } | undefined;

    if (!latestPlan) {
      db.exec("ROLLBACK");
      return res.status(404).json({ error: "Plan not found" });
    }

    if (typeof latestPlan.version !== "number") {
      db.exec("ROLLBACK");
      return res.status(500).json({ error: "Invalid plan version" });
    }

    newVersion = latestPlan.version + 1;
    name =
      req.body && typeof req.body.name === "string"
        ? req.body.name.trim()
        : typeof latestPlan.name === "string"
          ? latestPlan.name
          : "";

    db.prepare(
      "INSERT INTO plans (id, name, version, html) VALUES (?, ?, ?, ?)",
    ).run(planId, name, newVersion, html);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  res.status(201).json({ id: planId, version: newVersion, name });
});

app.get("/plans/:planId", (req, res) => {
  const { planId } = req.params;

  const planRow = db
    .prepare("SELECT * FROM plans WHERE id = ? ORDER BY version DESC LIMIT 1")
    .get(planId);

  if (!planRow || !isPlan(planRow)) {
    return res.status(404).json({ error: "Plan not found" });
  }

  res.send(wrapPlanWithVersionSwitcher(planRow));
});

app.get("/plans/:planId/:version", (req, res) => {
  const { planId, version } = req.params;
  const parsedVersion = Number.parseInt(version, 10);

  if (!Number.isInteger(parsedVersion) || parsedVersion <= 0) {
    return res.status(400).json({ error: "Invalid version" });
  }

  const planRow = db
    .prepare("SELECT * FROM plans WHERE id = ? AND version = ?")
    .get(planId, parsedVersion);

  if (!planRow || !isPlan(planRow)) {
    return res.status(404).json({ error: "Plan not found" });
  }

  res.send(wrapPlanWithVersionSwitcher(planRow));
});

const PORT = process.env.PORT || 3007;

const server = app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

let shuttingDown = false;
const shutdown = (signal: string): void => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down gracefully.`);
  server.close(() => {
    db.close();
    console.log("SQLite database closed.");
    process.exit(0);
  });
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

const wrapPlanWithVersionSwitcher = (plan: Plan): string => {
  const versions = db
    .prepare("SELECT version FROM plans WHERE id = ? ORDER BY version DESC")
    .all(plan.id) as { version: number }[];

  const versionOptions = versions
    .map(
      (v) =>
        `<option value="${v.version}" ${v.version === plan.version ? "selected" : ""}>Version ${v.version}</option>`,
    )
    .join("");

  const switcherHTML = `
      <a class="control" href="/">All plans</a>
      <label for="version-select">Select Version:</label>
      <select id="version-select" onchange="switchVersion(this.value)">
        ${versionOptions}
      </select>
    <script>
      function switchVersion(version) {
        window.location.href = '/plans/${plan.id}/' + version;
      }
    </script>
  `;
  const marker = "<!-- LUKR_VERSION_SELECTOR -->";
  if (plan.html.includes(marker)) return plan.html.replace(marker, switcherHTML);
  const fallback = `<nav aria-label="Plan navigation" style="display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:16px;">${switcherHTML}</nav>`;
  // Keep full older documents valid where possible, without changing stored HTML.
  if (/<body\b[^>]*>/i.test(plan.html)) return plan.html.replace(/<body\b[^>]*>/i, body => body + fallback);
  return fallback + plan.html;
};
