# Agent Instructions

Use the `lukr` skill in planning workflows.

## Plan Mode Behavior

- If the user asks for a plan, roadmap, implementation steps, or phased approach, invoke the `lukr` skill.
- In writable modes, publish the plan to Lukr and return both URLs:
  - latest: `/plans/:planId`
  - versioned: `/plans/:planId/:version`
- In read-only Plan Mode, do not claim failure.
- In read-only Plan Mode, return:
  - the full HTML plan body
  - a ready-to-run `curl` publish command for execute mode
  - a one-line handoff that publishing must run in writable mode
- Resolve `baseUrl` from, in order:
  1. user-provided URL
  2. `.lukr.json` in cwd
  3. `http://localhost:3007`
- Send plan payload as JSON with `html` and `name` fields.
