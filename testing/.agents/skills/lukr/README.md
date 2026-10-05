# Installation

Install both `lukr` and its required companion `lukr-plan`. From the repository root:

```sh
cp -R ./skills/lukr ./skills/lukr-plan ~/.agents/skills/
```

Use the equivalent agent-specific skills path when installing for another agent, for instance, Claude Code:

```bash
cp -R ./skills/lukr ./skills/lukr-plan ~/.claude/skills/
```

For OpenCode, use `~/.config/opencode/skills/`. Restart or refresh the agent's skill discovery after installation. Python 3 is required by the `lukr-plan` renderer.

`lukr` handles configuration, API calls, and versioned links. It requires `lukr-plan` before publishing a new or revised plan. Listing and retrieving existing plans need only `lukr`.
