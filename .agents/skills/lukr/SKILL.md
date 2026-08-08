---
name: lukr
description: Save, version, and retrieve plans when the user asks to create a plan
---

# Lukr

Use this skill when the user wants to create a plan.

Rules:

- Read the workspace URL from [.lukr.json](.lukr.json) under the key `lukrUrl`. Prompt the user to update this if it doesn't exist or is empty.
- Prefer the shortest path:
  - `POST /plans` to create a new plan
  - `POST /plans/:id` to create a new version of an existing plan
  - `GET /plans` to list plans
  - `GET /plans/:id` for the latest version, or `GET /plans/:id/:version` for a specific version
- Send a JSON body with two fields: `html` for the plan content and `name` for the plan title.
- Use the shortest path:
  - `POST /plans` with `{ "html": "...", "name": "..." }` to create a new plan
  - `POST /plans/:id` with `{ "html": "...", "name": "..." }` to create a new version of an existing plan
- Return a concise link like `${base}/plans/${id}` when the save succeeds.
- If the server is unreachable, say that plainly; do not invent success.
- In restricted environments, do not stall. Provide a ready-to-run `curl` or `python` command and the exact URL to open.

## Installation

Copy the canonical skill directory into the agent's skills directory, for example:

```sh
cp -R .agents/skills/lukr ~/.agents/skills/lukr
```

Use the equivalent agent-specific skills path when installing for another agent.
