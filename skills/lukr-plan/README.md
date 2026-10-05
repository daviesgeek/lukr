# Lukr plan

The rendering companion to `lukr`. Install both directories as described in [the Lukr skill installation guide](../lukr/README.md). Python 3 is required; there are no Python package dependencies.

## Document contract

The agent writes semantic plan content, then invokes `scripts/render_plan.py` from this installed skill directory. The renderer inserts the fragment into `assets/template.html` and writes a complete document. At publication, Lukr converts Mermaid source to embedded light/dark SVGs and retains the source before saving that self-contained document as a version.

The template supports a restrained technical-document presentation, System / Light / Dark themes, Overview / Full detail controls, individual disclosures, code, tables, facts, callouts, and steps. Plans with at least three `h2` sections get desktop and mobile contents navigation. Shorter plans stay in a centered reading column. Navigation reveals collapsed target sections and highlights the current heading.

## Shared colors and diagrams

`assets/semantic-colors.json` is the shared palette for the Python page renderer and Lukr's Mermaid SVG renderer. Frontend is blue, backend green, database purple, cloud orange, security red, messaging teal, and external actors gray. Use `.semantic` with a role class for labeled component references. Mermaid flowchart nodes use the same role names, such as `class API backend`, without author-defined colors.

Diagrams use `<pre class="mermaid">` within a captioned figure. Lukr renders them server-side at save time using bundled Mermaid and Chromium, with no browser runtime or CDN. Each diagram includes paired themed SVGs and retained source in a disclosure. Rendering failures reject the save before a version is inserted. Locally rendered HTML shows source until published.

## Version navigation contract

The toolbar contains a reserved `#lukr-version-slot` with the exact marker `<!-- LUKR_VERSION_SELECTOR -->`. The renderer leaves it intact. An empty slot occupies no space.

When server integration is added, Lukr should replace that marker in the served response, inside the stored document, with a label, selector, and navigation behavior. For example, the label can target `version-select` and the select can contain the server's version options. Selects inside the slot inherit the template's control styling. The server supplies the ID, available versions, selected version, and navigation logic. The template never fetches or infers them.

Plan authors must not populate the slot. Server-generated options belong in the served response rather than the stored plan. This skill reserves the integration point; it does not implement the server change.

## Design context

This is a product interface for trusted users reviewing coding-agent plans across a desktop and phone, in varying ambient light. Follow the system theme with explicit overrides. Prioritize a readable implementation sequence and decisions, then let readers inspect secondary detail. Use Archify as inspiration for clear hierarchy and explorable technical information, without depending on its renderer or turning prose plans into node canvases.

Use system fonts, a comfortable reading width, tinted neutral surfaces, one restrained accent, visible keyboard focus, and reduced-motion support. Avoid dashboards, decorative motion, repeated cards, and hiding essential steps in disclosures. Diagrams are optional supporting explanations.

## Renderer checks

From the repository root, run `python3 -m unittest discover -s skills/lukr-plan/tests -v`. These checks cover complete-document output, UTF-8 content, the reserved version marker, execution from another working directory, and rejected fragment formats.
