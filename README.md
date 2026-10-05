# Lukr ("looker")

A simple, versioned HTML plan viewer for your agent. Intentionally small, built with careful use of AI.

## Why?

HTML plans are becoming a common part of working with coding agents. I don't always create and review them on the same machine: I might make a plan on my homelab, then review it from my personal computer or my phone. As agents take on more work, carefully reviewing their plans matters more. I wanted somewhere to host and version those plans without having to commit them alongside the code.

Lukr is deliberately not a full planning application. It gives an agent somewhere to put a plan, gives me a URL I can open elsewhere, and keeps the previous versions around when the plan changes.

## Careful use of AI?

Yes. I didn't want to vibe code the whole thing. I wrote most of the application by hand and used AI selectively: to help with the more complex SQL, clean up names during refactoring, and structure the agent skills. The point wasn't to avoid AI, but to stay in control of the code and understand what was being added.

As I find more features worth building, I'll probably use AI more. The same principle will apply: keep the application intentional and stay in control of what goes into it.

## How?

Run the published Docker image:

```bash
docker run -d --name lukr -p 3007:3007 -v lukr-data:/app/data ghcr.io/daviesgeek/lukr:latest
```

To run from source instead, install dependencies with `pnpm install`, then start the server with `pnpm start`. The server runs on port `3007` by default, so you can open [http://localhost:3007](http://localhost:3007) to check that it's running.

Install both the `lukr` publishing skill and its `lukr-plan` rendering companion in your agent's skills directory, for example:

```bash
cp -R ./skills/lukr ./skills/lukr-plan ~/.agents/skills/
```

Or for Claude Code:

```bash
cp -R ./skills/lukr ./skills/lukr-plan ~/.claude/skills/
```

The skill tells the agent how to save a plan and how to retrieve it later. By default, it reads a `.lukr.json` file from the workspace to find the Lukr server, for example:

```json
{
  "lukrUrl": "http://localhost:3007"
}
```

If you use OpenCode and want one Lukr server for all workspaces, you can put the file at `~/.config/opencode/.lukr.json` instead. The skill checks the workspace file first and falls back to the global file. Because the global file is outside the current workspace, OpenCode may ask for access each time. To allow access without repeated prompts, add this exception to `~/.config/opencode/opencode.json`:

```json
{
  "permission": {
    "external_directory": {
      "~/.config/opencode/.lukr.json": "allow"
    }
  }
}
```

Merge this into your existing OpenCode configuration rather than replacing it.

Whenever you ask for a plan, tell your agent to use Lukr. It will save the plan and return a URL you can open in a browser.

## API

Plans are JSON with a required `html` string and an optional `name`.

| Method | Path                      | Purpose                           |
| ------ | ------------------------- | --------------------------------- |
| `POST` | `/plans`                  | Create a plan at version 1        |
| `POST` | `/plans/:planId`          | Create the next version of a plan |
| `GET`  | `/` or `/plans`           | Browse the plan library           |
| `GET`  | `/plans/:planId`          | View the latest version           |
| `GET`  | `/plans/:planId/:version` | View a specific version           |

Both `POST` routes accept `{ "html": "...", "name": "..." }` and return the plan ID, version, and name. The plan library shows 25 plans per page, with previous/next navigation via the optional `?page=N` query parameter. Each entry shows its latest version and can expand to show its saved version history. Plan pages include a version selector.

## Mermaid diagrams

Include HTML-escaped Mermaid source in a `<pre class="mermaid">` block, preferably inside a captioned `<figure>`:

```html
<figure class="diagram">
  <pre class="mermaid">flowchart LR
    Browser[Browser] --> API[API] --> DB[(Database)]
    class Browser frontend
    class API backend
    class DB database</pre>
  <figcaption>Request flow</figcaption>
</figure>
```

Before saving a new plan or revision, Lukr renders both light and dark SVG variants and embeds them in the stored document. Source remains available in a disclosure for future edits. Viewing a saved plan requires no Mermaid runtime, CDN, or browser-side diagram generation. Plans without Mermaid blocks follow the normal save path.

Flowchart role classes share the template palette: `frontend` blue, `backend` green, `database` purple, `cloud` orange, `security` red, `messaging` teal, and `external` gray. The palette is defined once in `skills/lukr-plan/assets/semantic-colors.json` and used by both the HTML and SVG renderers. Other Mermaid diagram types use the coordinated base theme.

Invalid Mermaid returns `422` with `error`, `diagram` identifying the one-based diagram number, and `detail`. Renderer startup failure returns `503`. Neither creates a plan or consumes a version. Rendering finishes before the database transaction begins.

The Docker image includes Chromium and fonts. For source development, `pnpm install` downloads Puppeteer's browser into the ignored project-local `.cache/puppeteer` directory. If installation scripts were skipped, run `pnpm exec puppeteer browsers install chrome`. To use an installed Chromium instead, set `PUPPETEER_EXECUTABLE_PATH` to its executable. The Docker runtime sets this automatically. `PUPPETEER_NO_SANDBOX=true` enables the container launch mode used by the image.

## Configuration

Set `PORT` to run the server on a different port:

```bash
PORT=4000 pnpm start
```

The project expects Node `v24.19.0`, which is recorded in `.nvmrc` and `.tool-versions`. There is no separate build step; `pnpm start` runs the TypeScript entrypoint through `tsx` and restarts it with `nodemon` when files in `src` change.

## That's it

It's a tiny server with a tiny database and a tiny skill. The useful part is having a stable URL for plans that I would otherwise lose in a chat window or leave stranded on another machine. Enjoy :)

## Future features?

Auth (maybe), diffing, different formats per plan (HTML/MD), more comprehensive design skills (this one is probably next), plan sanitization
