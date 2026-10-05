---
name: lukr-plan
description: Write and render canonical HTML plans only when creating or revising a plan for publication to Lukr. Used by the lukr skill before publishing.
---

# Lukr plan

Create coding plans for Lukr as a single, self-contained HTML document that is easy to scan, navigate, and read on desktop or mobile.

## Activation and handoff

- Use only when preparing a new or revised plan for publication to Lukr. Generic planning requests alone do not activate this skill.
- `lukr` is the entry point and owns server configuration, retrieval, publishing, versioning, and returned URLs. This skill owns writing and rendering the document, not publishing it.
- If invoked directly, load `lukr` only if it is not already active. If it is unavailable, stop and ask the user to install both skills. Do not invent a publishing workflow.
- When revising a plan, use the existing content retrieved by `lukr`, preserve unrelated content and decisions, and apply the requested changes. A complete replacement supplied by the user does not require retrieval.
- Every new or revised plan uses this canonical template. Do not preserve an older document's custom CSS, JavaScript, controls, or layout.
- Hand the rendered file and plan title back to the `lukr` workflow. Lukr stores the complete document, not just the fragment.

The plan content is generated separately from the page shell. Do **not** recreate, copy, or read the full HTML template into context. Generate only the plan fragment, then use the renderer to inject it into the canonical template.

## Core principles

1. **Content first, chrome second.** The HTML should make the plan easier to understand, not make it look impressive.
2. **Compose; do not redesign.** Use the template's existing visual language. Do not invent a new design system for each plan.
3. **Progressive disclosure is structural.** The first view should explain what is changing, why, and the shape of the approach. Dense implementation detail can be revealed when needed.
4. **Keep it simple.** Prefer semantic HTML, short sections, clear headings, lists, tables, and native `<details>` over elaborate UI.
5. **Let the plan fit the work.** Do not force every plan into a fixed section taxonomy. Choose sections based on the task.

## Workflow

1. Understand the requested work, including the retrieved plan when revising, and create the plan as you normally would.
2. Write **only the inner plan HTML fragment** to a temporary file such as `plan-content.html`.
3. Resolve this installed skill's directory from the skill loader or the path to this `SKILL.md`. Render the final page using the script's absolute path, not a path relative to the project workspace:

   ```bash
   python3 "<installed-lukr-plan-directory>/scripts/render_plan.py" "<temporary-directory>/plan-content.html" -o "<temporary-directory>/plan.html"
   ```

4. Open or inspect `plan.html` if your environment supports it.
5. If the renderer reports a structural violation, fix the fragment and render again. These checks enforce format conventions; they are not a security sanitizer.
6. Return the rendered complete document to `lukr` for publishing. Do not publish the fragment, copy retrieved viewer chrome into the fragment, or generate the final document by hand. If Python 3 or the renderer is unavailable, stop and explain the missing requirement.

Do not place `<html>`, `<head>`, `<body>`, `<style>`, or `<script>` tags in the generated fragment.

## Content guidance

The exact plan structure is intentionally flexible. Use the sections that best explain the work.

A strong plan usually makes the following easy to answer without reading every detail:

- What are we changing?
- Why are we changing it?
- What is the proposed approach?
- What are the major implementation steps?
- What code or systems are affected?
- How will we validate that the work is correct?
- What important risks, tradeoffs, assumptions, or open questions exist?

Do not add sections merely because this list mentions them.

## Progressive disclosure

Use progressive disclosure to reduce initial reading load, not to hide the plan.

### Keep visible by default

- The title and short summary
- Major plan sections
- The high-level implementation sequence
- Important decisions, constraints, or warnings needed to understand the approach

### Good candidates for `<details>`

- Long file lists
- Detailed rationale
- Alternatives considered
- Edge cases
- Detailed validation matrices
- Large code or command examples
- Secondary notes that are useful but not required for the first read

### Avoid

- Putting every implementation step inside an accordion
- Hiding essential decisions
- Creating deeply nested disclosure controls
- Turning a short plan into a dashboard

Use `<details>` only when collapsing the content makes the page easier to scan.

## Recommended HTML patterns

These are a vocabulary, **not a schema**. Use them when they fit; ordinary semantic HTML is always allowed.

### Plan header

```html
<header class="plan-header">
  <p class="eyebrow">Implementation plan</p>
  <h1>...</h1>
  <p class="lede">...</p>
</header>
```

### Standard section

```html
<section>
  <h2>...</h2>
  <p>...</p>
</section>
```

### Step sequence

```html
<ol class="steps">
  <li>
    <h3>...</h3>
    <p>...</p>
  </li>
</ol>
```

### Callout

Use callouts sparingly for information that deserves extra visual weight.

```html
<aside class="callout">
  <strong>Decision:</strong> ...
</aside>
```

Optional variants are `callout warning` and `callout success`.

### Metadata or compact facts

```html
<dl class="facts">
  <div><dt>Scope</dt><dd>...</dd></div>
  <div><dt>Risk</dt><dd>...</dd></div>
</dl>
```

### File or symbol references

Use inline `<code>` for paths, commands, identifiers, flags, and symbols:

```html
<p>Update <code>src/server/router.ts</code> and <code>createRouter()</code>.</p>
```

### Code or command blocks

```html
<pre><code>npm test
npm run lint</code></pre>
```

### Collapsible detail

```html
<details>
  <summary>Files likely affected</summary>
  ...
</details>
```

### Tables

Tables are appropriate for genuinely tabular comparisons, mappings, or validation matrices. Do not use them for ordinary prose.

### Diagrams

Keep the plan document-first. Add a diagram only when it explains relationships or a flow more clearly than prose. Inline SVG inside a `<figure>` with a `<figcaption>` is supported; give it an accessible name and keep it readable in both themes using `currentColor` where practical. Essential decisions and implementation steps must remain in the text. Do not add diagram runtimes, external dependencies, or one-off scripts. Archify is visual inspiration, not a required skill or renderer.

## Writing and UX guidance

- Lead with conclusions and decisions; follow with supporting detail.
- Prefer short paragraphs and meaningful headings.
- Break dense implementation work into ordered steps.
- Use bullets when order does not matter and numbered lists when it does.
- Use concrete file paths, symbols, commands, and interfaces when known.
- Avoid repeating the same information in the summary, steps, and notes.
- Avoid decorative headings, excessive badges, and status labels.
- Avoid giant walls of text.
- Keep heading hierarchy logical: one `<h1>`, then `<h2>`, then `<h3>` where useful.
- Do not manually build a table of contents. The template creates it from `<h2>` and `<h3>` headings.
- Do not manually add a toolbar, version selector, theme controls, or expand/collapse controls. The template owns their placement and presentation; Lukr supplies version navigation.
- Do not add sections just to reach the TOC threshold. Short plans should remain short.

## Styling and behavior contract

The final page already provides:

- responsive layout
- readable typography and line length
- automatic light/dark theme support
- manual System / Light / Dark theme control
- persistent manual theme preference when storage is available
- desktop sticky and compact mobile tables of contents when there are at least three `<h2>` sections; shorter plans use a centered reading column without a TOC
- current-section highlighting and navigation that opens disclosures containing the target heading
- automatic anchor links for `<h2>` and `<h3>` headings
- expand-all / collapse-all controls when `<details>` elements exist
- accessible focus states
- simple styling for prose, lists, code, tables, callouts, facts, and steps

The fragment should work with that system rather than replacing it.

### Reserved version slot

The toolbar reserves `#lukr-version-slot` containing `<!-- LUKR_VERSION_SELECTOR -->`. The renderer preserves this marker unchanged. Lukr can replace it when serving the stored document with a labeled selector, available versions, and navigation behavior. The template provides styling for a label and select inside that slot; the empty slot occupies no space.

Do not fill or duplicate the slot in plan content. Do not derive versions from the URL, call the API from the template, or store server-generated version options in the plan. An unused slot is expected until server integration is implemented separately.

## Guardrails

Generated plan content must not contain:

- `<style>` tags
- `<script>` tags
- inline `style="..."` attributes
- external stylesheet links
- external script sources
- `<iframe>`, `<object>`, or `<embed>`

These restrictions keep the output portable, self-contained, and visually consistent.

You **may**:

- use semantic HTML freely
- add classes when they help describe or group content
- use the documented classes above
- use `<details>` / `<summary>`
- use tables, lists, blockquotes, `<pre>`, `<code>`, `<kbd>`, and other ordinary content elements
- use inline SVG when it materially improves understanding, but prefer text and native HTML for plans

Do not add new CSS or JavaScript to support one-off classes. If a custom class has no template styling, it should still remain understandable as semantic HTML.

## Final quality check

Before finishing, confirm:

- The first screen communicates the purpose and overall approach.
- The plan is understandable without expanding every disclosure.
- Important implementation steps are visible and ordered clearly.
- Dense secondary detail is collapsed where useful, but not excessively.
- Headings are meaningful and hierarchical.
- The page does not depend on external assets or libraries.
- The fragment passes the renderer without structural violations.
- The final deliverable is the rendered self-contained `.html` file, not just the fragment.
