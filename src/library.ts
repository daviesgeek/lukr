import { publishing } from "./publishing.js";

export interface PlanHistory {
  version: number;
  created_at: string;
}

export interface LibraryPlan {
  id: string;
  name: string;
  version: number;
  updated_at: string;
  history: PlanHistory[];
}

export const PAGE_SIZE = 25;

export function libraryPage(value: unknown, total: number): number {
  const page = typeof value === "string" && /^[1-9]\d*$/.test(value) ? Number(value) : 1;
  return Math.min(page, Math.max(1, Math.ceil(total / PAGE_SIZE)));
}

const escape = (value: string): string => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC", hourCycle: "h23",
});

function time(timestamp: string): string {
  const date = new Date(timestamp.replace(" ", "T") + "Z");
  return `<time datetime="${date.toISOString()}">${dateFormat.format(date)} UTC</time>`;
}

// Palette and shared visual rules copied from skills/lukr-plan/assets/template.html.
// Self-contained so deployed servers do not need to load the skill template.
const darkTokens = `--bg:oklch(0.20 0.008 80);--surface:oklch(0.24 0.008 80);--surface-strong:oklch(0.29 0.01 80);--text:oklch(0.93 0.008 80);--muted:oklch(0.73 0.012 80);--border:oklch(0.37 0.012 80);--accent:oklch(0.80 0.11 80);--accent-soft:oklch(0.28 0.025 80);--code-bg:oklch(0.24 0.008 80);`;
const styles = `
:root{color-scheme:light dark;--bg:oklch(0.985 0.005 80);--surface:oklch(0.955 0.007 80);--surface-strong:oklch(0.92 0.009 80);--text:oklch(0.25 0.01 80);--muted:oklch(0.49 0.012 80);--border:oklch(0.85 0.012 80);--accent:oklch(0.46 0.10 65);--accent-soft:oklch(0.95 0.03 80);--code-bg:oklch(0.95 0.007 80);--focus:var(--accent);--content:72ch;--radius:6px;}
@media(prefers-color-scheme:dark){html[data-theme="system"]{${darkTokens}}}
html[data-theme="dark"]{${darkTokens}color-scheme:dark;}
html[data-theme="light"]{color-scheme:light;}
*{box-sizing:border-box;}
html,body{background:var(--bg);}
body{margin:0;color:var(--text);font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:16px;line-height:1.65;text-rendering:optimizeLegibility;}
select{font:inherit;}
p,li,h1,h2,h3,a,code{overflow-wrap:anywhere;}
a{color:var(--accent);text-decoration-thickness:1px;text-underline-offset:0.18em;}
a:hover{text-decoration-thickness:2px;}
:focus-visible{outline:3px solid var(--focus);outline-offset:3px;border-radius:4px;}
.skip-link{position:fixed;top:8px;left:12px;z-index:30;padding:8px 12px;background:var(--bg);transform:translateY(-150%);}
.skip-link:focus{transform:translateY(0);}
.toolbar{position:sticky;top:0;z-index:20;border-bottom:1px solid var(--border);background:var(--bg);}
.toolbar-inner{max-width:calc(var(--content) + 284px);min-height:60px;margin:0 auto;padding:8px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;}
.toolbar-title{color:var(--text);font-size:0.84rem;font-weight:650;letter-spacing:0.06em;white-space:nowrap;}
.theme-select,.control{min-height:40px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);color:var(--text);padding:6px 10px;font-size:0.84rem;max-width:100%;}
.theme-select:hover,.control:hover{background:var(--surface-strong);}
.layout{max-width:calc(var(--content) + 40px);margin:0 auto;padding:52px 20px 88px;}
main{min-width:0;scroll-margin-top:100px;}
.plan-header{padding-bottom:32px;margin-bottom:40px;border-bottom:1px solid var(--border);}
h1,h2,h3{line-height:1.22;letter-spacing:-0.018em;text-wrap:balance;}
h1{margin:0;font-size:2.6rem;letter-spacing:-0.035em;}
.lede{max-width:68ch;margin:14px 0 0;color:var(--muted);font-size:1.08rem;line-height:1.6;}
h2{margin:0 0 16px;padding-top:10px;font-size:1.55rem;}
p,ul,ol,pre,details{margin-top:0;margin-bottom:18px;}
p:last-child,ul:last-child,pre:last-child,details:last-child{margin-bottom:0;}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:0.9em;}
:not(pre)>code{background:var(--code-bg);border:1px solid var(--border);border-radius:5px;padding:0.12em 0.34em;}
pre{max-width:100%;overflow-x:auto;padding:15px 17px;background:var(--code-bg);border:1px solid var(--border);border-radius:var(--radius);line-height:1.55;}
pre code{font-size:0.88rem;}
details{border:1px solid var(--border);border-radius:var(--radius);background:var(--surface);}
summary{cursor:pointer;padding:12px 15px;font-weight:650;}
summary:hover{background:var(--surface-strong);}
details[open]>summary{border-bottom:1px solid var(--border);}
details>:not(summary){margin-left:15px;margin-right:15px;}
details>:nth-child(2){margin-top:15px;}
details>:last-child{margin-bottom:15px;}
.publishing{margin-bottom:40px;font-size:0.9rem;}
.publishing h2{font-size:1.12rem;}
.publishing p{margin-bottom:12px;}
.endpoints{padding-left:1.35rem;}
.endpoints li{margin-top:4px;}
.plan-list{list-style:none;padding:0;margin:0;}
.plan-row{padding:24px 0;border-top:1px solid var(--border);}
.plan-row h3{margin:0;font-size:1.25rem;}
.plan-title{display:inline-block;padding:8px 0;}
.metadata,.plan-id,.range,.page-position{color:var(--muted);font-size:0.86rem;}
.metadata{margin:0 0 16px;}
.history{padding-left:1.35rem;}
.history li{margin-top:8px;}
.history a{display:inline-block;padding:8px 0;}
.history-date{display:block;color:var(--muted);font-size:0.86rem;}
.plan-id code{background:none;border:0;padding:0;}
.pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border-top:1px solid var(--border);padding-top:24px;}
.pagination a{display:inline-flex;align-items:center;text-decoration:none;}
.empty{border-top:1px solid var(--border);padding-top:24px;}
@media(max-width:900px){.layout{padding-top:28px;}}
@media(max-width:620px){body{font-size:15px;}.toolbar-inner{gap:8px;padding:8px 16px;}.layout{padding:24px 16px 56px;}h1{font-size:2rem;}}
`;

function publishingGuide(): string {
  return `<details class="publishing">
    <summary>Save a plan</summary>
    <p>${escape(publishing.setup)}</p>
    <pre><code>${escape(publishing.configuration)}</code></pre>
    <ul class="endpoints">${publishing.endpoints.map(endpoint => `<li><code>${endpoint.path}</code> ${endpoint.description}</li>`).join("")}</ul>
    <p><a href="/llms.txt">Instructions for agents</a>, with JSON request and response examples.</p>
  </details>`;
}

function planRow(plan: LibraryPlan): string {
  const path = `/plans/${encodeURIComponent(plan.id)}`;
  return `<li class="plan-row">
    <h3><a class="plan-title" href="${path}">${plan.name.trim() || "Untitled plan"}</a></h3>
    <p class="metadata">Version ${plan.version} · Updated ${time(plan.updated_at)}</p>
    <details><summary>Version history · ${plan.history.length} ${plan.history.length === 1 ? "version" : "versions"}</summary>
      <p class="plan-id">Plan ID: <code>${escape(plan.id)}</code></p>
      <ul class="history">${plan.history.map(entry => `<li><a href="${path}/${entry.version}">Version ${entry.version}${entry.version === plan.version ? ", latest" : ""}</a><span class="history-date">Saved ${time(entry.created_at)}</span></li>`).join("")}</ul>
    </details>
  </li>`;
}

export function renderLibrary(plans: LibraryPlan[], total: number, page: number, failed = false): string {
  const pages = Math.ceil(total / PAGE_SIZE);
  const list = failed
    ? `<section class="empty"><h2>Couldn't load plans</h2><p>Please try again. <a href="">Reload plans</a></p></section>`
    : total === 0
      ? `<section class="empty"><h2>No plans yet</h2><p>Ask your agent to save a plan to Lukr. It will appear here.</p></section>`
      : `<section aria-label="Saved plans"><p class="range">${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total} plans</p>
        <ul class="plan-list">${plans.map(planRow).join("")}</ul>
        <nav class="pagination" aria-label="Pagination">${page > 1 ? `<a class="control" rel="prev" href="?page=${page - 1}">Previous</a>` : ""}<span class="page-position">Page ${page} of ${pages}</span>${page < pages ? `<a class="control" rel="next" href="?page=${page + 1}">Next</a>` : ""}</nav></section>`;
  return `<!doctype html><html lang="en" data-theme="system"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>Plans | Lukr</title>
    <style>${styles}</style></head><body>
    <a class="skip-link" href="#library-content">Skip to plans</a>
    <div class="toolbar"><div class="toolbar-inner"><div class="toolbar-title">LUKR / PLANS</div>
      <select class="theme-select" id="theme-select" aria-label="Theme"><option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option></select>
    </div></div>
    <div class="layout"><main id="library-content" tabindex="-1"><header class="plan-header"><h1>Plans</h1><p class="lede">Saved plans from your agent, with every version kept.</p></header>
    ${publishingGuide()}${list}</main></div>
    <script>(() => {
      const root = document.documentElement;
      const theme = document.getElementById('theme-select');
      let saved = null;
      try { saved = localStorage.getItem('plan-theme'); } catch {}
      const initial = ['system', 'light', 'dark'].includes(saved) ? saved : 'system';
      root.dataset.theme = initial;
      theme.value = initial;
      theme.addEventListener('change', () => {
        root.dataset.theme = theme.value;
        try { localStorage.setItem('plan-theme', theme.value); } catch {}
      });
    })();</script></body></html>`;
}
