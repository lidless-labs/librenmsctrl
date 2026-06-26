# Security Policy

## Supported versions

librenms-mcp is a work-in-progress (pre-1.0) release. Only the latest published version on the `master` branch receives security fixes. Pin to a released tag if you need a known-good version.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security problems. Email **me@solomonneas.dev** with: <!-- content-guard: allow pii/email -->

- A short description of the issue.
- Steps to reproduce (or a minimal proof of concept).
- The version or commit you tested against.
- Whether you would like to be credited in the release notes.

You should get an acknowledgment within 72 hours. If you do not, please follow up; the mail may have been filtered.

## In scope

- Write-gate bypasses: any path where a tier-2 write tool runs without an explicit `confirm: true`, or where a tier-3 destructive shape can be invoked at all.
- Input-validation bypasses: arguments that reach a LibreNMS URL path or query string without passing the published TypeBox schema check, or injection through an unencoded interpolated value.
- Token or credential leakage: the `LIBRENMS_TOKEN` (or any secret) appearing unredacted in log output, error messages, or tool results.
- TLS handling flaws beyond the documented `LIBRENMS_TLS_INSECURE` opt-out.

## Out of scope

- Bugs in LibreNMS itself; report those to the [LibreNMS project](https://github.com/librenms/librenms).
- Bugs in the MCP SDK, OpenClaw, Claude Code, or Codex; report those to their respective projects.
- Issues that require an attacker to already have write access to the user's machine, the MCP client config, or the npm account.
- Misconfiguration on the operator's side, such as using a high-privilege LibreNMS token role or setting `LIBRENMS_TLS_INSECURE=true` on a CA-signed endpoint.

## Token scope guidance

This server is only as safe as the token you give it. Start with a **Read Only** LibreNMS API token role (Settings > API > New API Token > Read Only), confirm the read tools work and that your token is masked in transcripts, and grade up only when you have verified the confirm gate is honored. Tokens can be revoked instantly from the same Settings > API screen.

## Disclosure

We aim to ship a fix within 14 days of confirming a valid report. A coordinated disclosure timeline can be negotiated for issues that need longer.
