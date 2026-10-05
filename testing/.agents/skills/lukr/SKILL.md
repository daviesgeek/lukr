---
name: lukr
description: Publish, revise, list, and retrieve plans in Lukr. Use when the user asks to publish a plan or work with a plan stored in Lukr.
---

# Lukr

Use this skill when the user wants to publish a plan, revise a plan in Lukr, or list or retrieve stored plans. It is the entry point for the Lukr workflow. Generic planning requests alone do not require publication.

## Creating and revising plans

1. Before creating or revising a plan, load `lukr-plan`. It owns the content-writing instructions, canonical template, and renderer. If it is unavailable, stop with instructions to install both `lukr` and `lukr-plan` skill directories. Do not fall back to hand-authored complete HTML.
2. For a revision, resolve the existing plan ID and retrieve its latest version with `GET /plans/:id` before editing. Preserve unrelated content and decisions. Skip retrieval only when the user supplies a complete replacement. If retrieval fails, report it and stop rather than reconstructing the plan from memory.
3. Use `lukr-plan` to produce a rendered complete HTML document. Every new version uses the current canonical template, including revisions of older custom documents. Keep retrieved version-switcher markup and other viewer chrome out of the plan content.
4. Publish the rendered document as the `html` field, with the plan title as `name`. For a revision, use `POST /plans/:id` to keep its history. Do not publish the fragment or a document that still contains the `PLAN_CONTENT` marker. The reserved `LUKR_VERSION_SELECTOR` marker should remain for server integration.
5. Return the exact versioned URL from the save response as described below.

Listing and retrieving plans do not require `lukr-plan`. Do not regenerate or republish a plan when the user only asks to read it.

## Publishing and API rules

Rules:

- Read `lukrUrl` from the workspace's [.lukr.json](.lukr.json). If that file does not exist or its `lukrUrl` is empty, read `~/.config/opencode/.lukr.json` instead. Prompt the user to update the configuration only if both files are missing or have an empty `lukrUrl`.
- Prefer the shortest path:
  - `POST /plans` to create a new plan
  - `POST /plans/:id` to create a new version of an existing plan
  - `GET /plans` to list plans
  - `GET /plans/:id` for the latest version, or `GET /plans/:id/:version` for a specific version
- Send a JSON body with two fields: `html` for the rendered complete document and `name` for the plan title. Read the rendered file and JSON-encode it rather than inserting raw HTML into a shell command.
- Use the `id` and `version` returned by the save response. Return the exact
  versioned link `${base}/plans/${id}/${version}` so the user can view the
  version that was just saved.
- Do not append query parameters, hashes, or arbitrary path segments to make
  the URL show the current version. The supported version parameter is the
  numeric path segment after the plan ID.
- If the server is unreachable, say that plainly; do not invent success.
- In restricted environments, do not stall. Provide a ready-to-run `curl` or `python` command and the exact URL to open.
