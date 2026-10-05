#!/usr/bin/env python3
"""Render a plan fragment as a complete HTML document for publication to Lukr."""

from __future__ import annotations

import argparse
import re
from pathlib import Path

TOKEN = "<!-- PLAN_CONTENT -->"

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

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(page.replace(TOKEN, fragment), encoding="utf-8")
    print(args.output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
