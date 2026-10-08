# Public submission and review

Sources: `https://developers.openai.com/plugins/deploy/submission.md`, `.../deploy/submission-errors`, `.../plugin-guidelines`. Re-read before submitting; requirements change. Never submit without explicit user confirmation.

## Who and where

Upload a ZIP at `https://platform.openai.com/plugins`. Organization owners can submit; others need the "Apps Management Write" permission. Developer identity verification is required.

## ZIP rules

- Plugin ZIPs containing app references (`apps` / `.app.json`) or lifecycle hooks cannot currently be submitted. Declare MCP server URLs in the MCP config and finish setup in the dashboard.
- A plugin has **exactly one** remote MCP server. A skills-only plugin omits `review` and the MCP config.
- The MCP server must be at a public HTTPS URL.
- No secrets in the ZIP.

## Domain verification

Host the exact token at `https://<host>/.well-known/openai-apps-challenge`.

## Review requirements

- Reviewer credentials without MFA and without private-network access.
- 5 positive and 3 negative test cases (`extensions.com.openai.review.test_cases`).
- A walkthrough video URL (`demo_recording_url`).
- Release notes and, for each country, publication data.
- Privacy policy and terms URLs; accurate `commerce` flag.

## After approval: updates

- Package changes need a **new ZIP**.
- Hosted MCP tool changes are scanned daily or on **Rescan**. Held tool changes can be appealed; automatic MCP updates pause during an appeal.
- Package changes, authentication and shared server instructions cannot be appealed.
- Adding an MCP server to a skills-only plugin is unsupported. Changing the server URL requires support.

## Preflight list

- [ ] No hooks, no `apps`, no `.app.json`
- [ ] Exactly one remote MCP server on public HTTPS (if any)
- [ ] Domain token served
- [ ] 5 positive, 3 negative cases; video; release notes
- [ ] Reviewer credentials working
- [ ] Icons, descriptions, privacy and terms URLs present
- [ ] Reviewed against plugin-guidelines
