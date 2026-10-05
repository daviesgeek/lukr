import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { load } from "cheerio";
import type { Browser } from "puppeteer";

interface RoleColors {
  background: string;
  border: string;
  text: string;
}

const palette = JSON.parse(
  readFileSync(
    resolve(__dirname, "../skills/lukr-plan/assets/semantic-colors.json"),
    "utf8",
  ),
) as Record<string, { label: string; light: RoleColors; dark: RoleColors }>;

const diagramStyles = `
  .mermaid-diagram { margin: 24px 0; max-width: 100%; }
  .mermaid-view { max-width: 100%; overflow-x: auto; }
  .mermaid-view svg { display: block; height: auto; }
  .mermaid-dark { display: none; }
  html[data-theme="dark"] .mermaid-light { display: none; }
  html[data-theme="dark"] .mermaid-dark { display: block; }
  @media (prefers-color-scheme: dark) {
    html[data-theme="system"] .mermaid-light { display: none; }
    html[data-theme="system"] .mermaid-dark { display: block; }
  }
  .mermaid-source { margin-top: 16px; }
`;

export class MermaidRenderError extends Error {
  readonly diagram: number;
  readonly status: number;

  constructor(diagram: number, status: number, message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "MermaidRenderError";
    this.diagram = diagram;
    this.status = status;
  }
}

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    };
    return entities[character];
  });

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

// Some Mermaid grammars use fixed inner IDs even when svgId is unique.
// Namespace those IDs and their CSS, marker, link, and accessibility references.
const namespaceSvg = (markup: string, prefix: string): string => {
  const $ = load(markup, { xmlMode: true });
  const root = $("svg")[0];
  const ids = new Map<string, string>();
  $("[id]").each((_index, node) => {
    if (node === root) return;
    const id = $(node).attr("id")!;
    ids.set(id, `${prefix}-${id}`);
    $(node).attr("id", ids.get(id)!);
  });
  $("[aria-labelledby], [aria-describedby]").each((_index, node) => {
    for (const attribute of ["aria-labelledby", "aria-describedby"]) {
      const value = $(node).attr(attribute);
      if (value) $(node).attr(attribute, value.split(/\s+/).map(id => ids.get(id) || id).join(" "));
    }
  });
  if (!ids.size) return $.xml();
  const escaped = [...ids.keys()].map(id => id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const references = new RegExp(`#(${escaped.join("|")})(?=[^a-zA-Z0-9_-]|$)`, "g");
  return $.xml().replace(references, (_match, id: string) => `#${ids.get(id)}`);
};

const themeConfig = (theme: "light" | "dark") => {
  const neutral = palette.external[theme];
  const themeCSS = Object.entries(palette).map(([role, variants]) => {
    const colors = variants[theme];
    return `
      .${role} rect, .${role} polygon, .${role} circle, .${role} ellipse, .${role} path {
        fill: ${colors.background} !important;
        stroke: ${colors.border} !important;
      }
      .${role} text, .${role} tspan { fill: ${colors.text} !important; }
      .${role} .nodeLabel { color: ${colors.text} !important; }
    `;
  }).join("\n");

  return {
    theme: "base" as const,
    fontFamily: 'Arial, "DejaVu Sans", sans-serif',
    themeCSS,
    themeVariables: {
      darkMode: theme === "dark",
      background: theme === "dark" ? "#20201c" : "#faf9f6",
      primaryColor: neutral.background,
      primaryBorderColor: neutral.border,
      primaryTextColor: neutral.text,
      secondaryColor: neutral.background,
      secondaryTextColor: neutral.text,
      tertiaryColor: neutral.background,
      tertiaryTextColor: neutral.text,
      lineColor: neutral.border,
      textColor: neutral.text,
      actorBkg: neutral.background,
      actorBorder: neutral.border,
      actorTextColor: neutral.text,
      signalColor: neutral.text,
      signalTextColor: neutral.text,
      noteBkgColor: neutral.background,
      noteTextColor: neutral.text,
      noteBorderColor: neutral.border,
    },
    flowchart: { htmlLabels: false },
  };
};

interface Replacement {
  start: number;
  end: number;
  html: string;
}

const replaceRanges = (html: string, replacements: Replacement[]): string => {
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    html = html.slice(0, replacement.start) + replacement.html + html.slice(replacement.end);
  }
  return html;
};

/** Render before a database transaction. Unrelated document bytes stay intact. */
export async function renderPlanDiagrams(html: string): Promise<string> {
  const $ = load(html, {
    xml: { xmlMode: false, decodeEntities: true, withStartIndices: true, withEndIndices: true },
  }, false);
  const diagrams = $("pre.mermaid").toArray();
  if (!diagrams.length) return html;

  let browser: Browser;
  let renderMermaid: typeof import("@mermaid-js/mermaid-cli").renderMermaid;
  try {
    const [puppeteer, mermaid] = await Promise.all([
      import("puppeteer"),
      import("@mermaid-js/mermaid-cli"),
    ]);
    renderMermaid = mermaid.renderMermaid;
    browser = await puppeteer.default.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: process.env.PUPPETEER_NO_SANDBOX === "true" ? ["--no-sandbox"] : [],
      protocolTimeout: 60_000,
    });
  } catch (error) {
    throw new MermaidRenderError(1, 503, `Cannot start Mermaid renderer: ${messageOf(error)}`, error);
  }

  const replacements: Replacement[] = [];
  const renderId = `lukr-mermaid-${randomUUID()}`;
  try {
    for (const [index, diagram] of diagrams.entries()) {
      const block = $(diagram);
      const source = block.text();
      const existing = block.closest("[data-lukr-mermaid]");
      const target = existing.length ? existing[0] : diagram;
      const caption = block.closest("figure").find("figcaption").first().text().trim();
      const views: string[] = [];
      try {
        for (const theme of ["light", "dark"] as const) {
          const svgId = `${renderId}-${index + 1}-${theme}`;
          const result = await renderMermaid(browser, source, "svg", {
            svgId,
            backgroundColor: "transparent",
            fontEmbed: false,
            mermaidConfig: themeConfig(theme),
          });
          const svg = load(namespaceSvg(Buffer.from(result.data).toString("utf8"), svgId), { xmlMode: true });
          const root = svg("svg");
          root.attr("role", "img");
          if (!result.title && !result.desc) root.attr("aria-label", caption || `Diagram ${index + 1}`);
          const width = Number(root.attr("viewBox")?.split(/\s+/)[2]);
          if (Number.isFinite(width) && width > 0) {
            root.attr("style", `background:transparent;max-width:none;min-width:${Math.ceil(width)}px`);
          }
          views.push(`<div class="mermaid-view mermaid-${theme}" tabindex="0" role="region" aria-label="${escapeHtml(caption || `Diagram ${index + 1}`)}">${svg.xml()}</div>`);
        }
      } catch (error) {
        throw new MermaidRenderError(index + 1, 422, `Diagram ${index + 1}: ${messageOf(error)}`, error);
      }
      replacements.push({
        start: target.startIndex!,
        end: target.endIndex! + 1,
        html: `<div class="mermaid-diagram" data-lukr-mermaid="${index + 1}">
${views.join("\n")}
<details class="mermaid-source"><summary>Mermaid source</summary><pre class="mermaid"><code>${escapeHtml(source)}</code></pre></details>
</div>`,
      });
    }
  } finally {
    await browser.close();
  }

  // Include presentation CSS in the saved document, including standalone exports.
  const styles = `<style id="lukr-mermaid-styles">${diagramStyles}</style>`;
  const existingStyles = $("#lukr-mermaid-styles")[0];
  if (existingStyles) {
    replacements.push({ start: existingStyles.startIndex!, end: existingStyles.endIndex! + 1, html: styles });
  } else {
    const head = $("head")[0];
    const position = head?.endIndex != null ? html.lastIndexOf("</", head.endIndex) : 0;
    replacements.push({ start: position, end: position, html: styles });
  }
  return replaceRanges(html, replacements);
}
