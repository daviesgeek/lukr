import { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import express from "express";

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

interface PlanListRow {
  id: string;
  name: string;
  versions: string;
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

app.get("/", (_req, res) => {
  const message = [
    "This is lukr, a simple HTML plan viewer for your agent.",
    "",
    `Send a POST request to /plans with {"html": "...", "name": "..."} to create a new plan.`,
    "You'll receive a 201 response, a UUID, and a version if the plan was successfully registered. You can then view your plan at /plans/:planId, or a specific version at /plans/:planId/:version.",
    "",
    "The plan is versioned, so if you send a new plan with the same UUID, it will create a new version of the plan.",
    "That's it! Enjoy :)",
  ].join("<br />");

  res.send(message);
});

app.get("/plans", (_req, res) => {
  const planRows = db
    .prepare(
      `
        SELECT
          grouped.id,
          (
            SELECT latest.name
            FROM plans latest
            WHERE latest.id = grouped.id
            ORDER BY latest.version DESC
            LIMIT 1
          ) AS name,
          GROUP_CONCAT(grouped.version, ',') AS versions
        FROM (
          SELECT id, version
          FROM plans
          ORDER BY id ASC, version DESC
        ) grouped
        GROUP BY grouped.id
        ORDER BY grouped.id ASC
      `,
    )
    .all() as unknown as PlanListRow[];

  const planItems = planRows
    .map((plan) => {
      const versionItems = plan.versions
        .split(",")
        .map((version) => Number.parseInt(version, 10))
        .filter((version) => Number.isInteger(version) && version > 0)
        .map(
          (version) =>
            `<li><a href="/plans/${plan.id}/${version}">Version ${version}</a></li>`,
        )
        .join("");

      return `
        <li>
          <a href="/plans/${plan.id}">${plan.name} - ${plan.id}</a>
          <ul>${versionItems}</ul>
        </li>
      `;
    })
    .join("");

  const html = `
    <h1>Plans</h1>
    <ul>
      ${planItems || "<li>No plans found</li>"}
    </ul>
  `;

  res.type("html").send(html);
});

app.post("/plans", (req, res) => {
  const html =
    req.body && typeof req.body.html === "string" ? req.body.html.trim() : "";
  if (typeof html !== "string" || html.length === 0) {
    return res.status(400).json({ error: "Missing html" });
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

app.post("/plans/:planId", (req, res) => {
  const { planId } = req.params;

  const html =
    req.body && typeof req.body.html === "string" ? req.body.html.trim() : "";
  if (typeof html !== "string" || html.length === 0) {
    return res.status(400).json({ error: "Missing html" });
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
    <div style="margin-bottom: 20px;">
      <label for="version-select">Select Version:</label>
      <select id="version-select" onchange="switchVersion(this.value)">
        ${versionOptions}
      </select>
    </div>
    <script>
      function switchVersion(version) {
        window.location.href = '/plans/${plan.id}/' + version;
      }
    </script>
  `;
  return switcherHTML + plan.html;
};
