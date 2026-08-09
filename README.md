# Lukr ("looker")

A simple, versioned HTML plan viewer for your agent. Intentionally small, built with careful use of AI.

## Why?

HTML plans are becoming a common part of working with coding agents. I don't always create and review them on the same machine: I might make a plan on my homelab, then review it from my personal computer or my phone. As agents take on more work, carefully reviewing their plans matters more. I wanted somewhere to host and version those plans without having to commit them alongside the code.

Lukr is deliberately not a full planning application. It gives an agent somewhere to put a plan, gives me a URL I can open elsewhere, and keeps the previous versions around when the plan changes.

## Careful use of AI?

Yes. I didn't want to vibe code the whole thing. I wrote most of the application by hand and used AI selectively: to help with the more complex SQL, clean up names during refactoring, and structure the agent skills. The point wasn't to avoid AI, but to stay in control of the code and understand what was being added.

As I find more features worth building, I'll probably use AI more. The same principle will apply: keep the application intentional and stay in control of what goes into it.

## How?

Install dependencies with `pnpm install`, then start the server with `pnpm start`. The server runs on port `3007` by default, so you can open [http://localhost:3007](http://localhost:3007) to check that it's running.

Install the `lukr` skill in your agent's skills directory. The skill tells the agent how to save a plan and how to retrieve it later. It reads a `.lukr.json` file from the workspace to find the Lukr server, for example:

```json
{
  "lukrUrl": "http://localhost:3007"
}
```

Whenever you ask for a plan, tell your agent to use Lukr. It will save the plan and return a URL you can open in a browser.

## API

Plans are JSON with a required `html` string and an optional `name`.

| Method | Path                      | Purpose                           |
| ------ | ------------------------- | --------------------------------- |
| `POST` | `/plans`                  | Create a plan at version 1        |
| `POST` | `/plans/:planId`          | Create the next version of a plan |
| `GET`  | `/plans`                  | List all plans and versions       |
| `GET`  | `/plans/:planId`          | View the latest version           |
| `GET`  | `/plans/:planId/:version` | View a specific version           |

Both `POST` routes accept `{ "html": "...", "name": "..." }` and return the plan ID, version, and name. Plan pages include a version selector.

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
