# Agent Instructions

## Accepted Risks

Lukr is a small, self-hosted tool intended for use by trusted users in a trusted environment. The following risks are understood and accepted for the project's current scope:

- Plan HTML is stored and rendered without sanitization, so submitted content may execute scripts or otherwise alter the rendered page.
- Plan names are rendered without HTML escaping.
- The HTML plan renderer performs structural checks only; it is not a security sanitizer and does not block every form of active or malformed HTML.
- The API does not provide authentication, authorization, rate limiting, or per-user isolation.
- Request bodies, plan HTML, and plan names do not have project-specific size limits beyond framework defaults.
- Plans and their scripts run on the same origin as the Lukr application.

Do not treat these as release blockers or add defensive complexity solely to address them unless the deployment model changes. Reassess them if Lukr becomes internet-facing, supports untrusted users or content, stores sensitive information, or grows beyond its current small self-hosted use case.
