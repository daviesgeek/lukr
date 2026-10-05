#!/usr/bin/env python3
"""Render a plan fragment as a complete HTML document for publication to Lukr."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

TOKEN = "<!-- PLAN_CONTENT -->"
COLOR_TOKEN = "/* SEMANTIC_COLORS */"

# Intentionally small. These checks protect the template boundary without trying
# to validate or sanitize arbitrary HTML.
FORBIDDEN = (
    (re.compile(r"<\s*style\b", re.I), "<style> tags are not allowed"),
    (re.compile(r"<\s*script\b", re.I), "<script> tags are not allowed"),
    (re.compile(r"\sstyle\s*=", re.I), "inline style attributes are not allowed"),
    (re.compile(r"<\s*link\b", re.I), "<link> tags are not allowed"),
    (re.compile(r"<\s*(?:html|head|body)\b", re.I), "document shell tags are not allowed"),
    (re.compile(r"\bsrc\s*=\s*['\"]?\s*(?:https?:)?//", re.I), "remote src attributes are not allowed"),
    (re.compile(r"<\s*(?:iframe|object|embed)\b", re.I), "embedded external content is not allowed"),
)


def validate(fragment: str) -> list[str]:
    return [message for pattern, message in FORBIDDEN if pattern.search(fragment)]


def semantic_styles(asset_directory: Path) -> str:
    """Use the same palette as the server's Mermaid renderer."""
    colors = json.loads((asset_directory / "semantic-colors.json").read_text(encoding="utf-8"))

    def variables(theme: str) -> str:
        return "\n".join(
            f"      --{role}-{key}: {value};"
            for role, variants in colors.items()
            for key, value in variants[theme].items()
        )

    selectors = "\n".join(
        f"    .semantic.{role} {{ --role-background: var(--{role}-background); "
        f"--role-border: var(--{role}-border); --role-text: var(--{role}-text); }}"
        for role in colors
    )
    return (
        f":root {{\n{variables('light')}\n    }}\n"
        f"    @media (prefers-color-scheme: dark) {{\n"
        f"      html[data-theme=\"system\"] {{\n{variables('dark')}\n      }}\n    }}\n"
        f"    html[data-theme=\"dark\"] {{\n{variables('dark')}\n    }}\n"
        f"{selectors}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("fragment", type=Path, help="HTML fragment containing only plan content")
    parser.add_argument("-o", "--output", type=Path, default=Path("plan.html"))
    args = parser.parse_args()

    fragment = args.fragment.read_text(encoding="utf-8")
    errors = validate(fragment)
    if errors:
        parser.error("invalid plan fragment:\n  - " + "\n  - ".join(errors))

    template = Path(__file__).resolve().parent.parent / "assets" / "template.html"
    page = template.read_text(encoding="utf-8")
    if page.count(TOKEN) != 1:
        parser.error(f"template must contain exactly one {TOKEN!r} token")
    if page.count(COLOR_TOKEN) != 1:
        parser.error(f"template must contain exactly one {COLOR_TOKEN!r} token")
    page = page.replace(COLOR_TOKEN, semantic_styles(template.parent))

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(page.replace(TOKEN, fragment), encoding="utf-8")
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
