// Shared publishing facts for the library and the agent-facing guide.
export const publishing = {
  purpose: "Lukr is a small, versioned HTML plan viewer for coding agents.",
  configuration: JSON.stringify({ lukrUrl: "https://YOUR-LUKR-SERVER" }, null, 2),
  setup: "Set lukrUrl in .lukr.json to this server's public base URL, including any reverse-proxy prefix. Then ask an agent using the Lukr publishing skill to save a plan. Use the lukr-plan HTML plan skill to produce the plan document.",
  request: JSON.stringify({ name: "Implementation plan", html: "<!doctype html><html><body><h1>Implementation plan</h1></body></html>" }, null, 2),
  response: JSON.stringify({ id: "PLAN_ID", version: 1, name: "Implementation plan" }, null, 2),
  endpoints: [
    { path: "POST /plans", description: "Create a new plan." },
    { path: "POST /plans/:planId", description: "Append a revision to an existing plan." },
    { path: "GET /plans/:planId", description: "View the latest version." },
    { path: "GET /plans/:planId/:version", description: "View an exact saved version." },
  ],
  versions: "Revisions append a new version; they do not replace earlier versions. Latest URLs can change. Build an exact saved-version link with the returned id and version: /plans/PLAN_ID/1.",
};

export function renderPublishingText(): string {
  return `# Lukr publishing guide

${publishing.purpose}

## Configuration and skills

Base-URL placeholder: https://YOUR-LUKR-SERVER
All endpoint paths below are relative to that base URL.

${publishing.setup}

Create .lukr.json:

\`\`\`json
${publishing.configuration}
\`\`\`

## Endpoints

${publishing.endpoints.map(endpoint => `- \`${endpoint.path}\`: ${endpoint.description}`).join("\n")}

## Request examples

POST /plans and POST /plans/:planId accept JSON with html and an optional name:

\`\`\`json
${publishing.request}
\`\`\`

Creating or revising a plan returns HTTP 201 with id, version, and name:

\`\`\`json
${publishing.response}
\`\`\`

On revisions, omitting name keeps the previous name.

## Saved versions

${publishing.versions}
`;
}
