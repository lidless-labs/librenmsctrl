# librenms-mcp Design

An MCP server that exposes LibreNMS read + safe-write tools to AI agents over the documented REST API. 10 tools: 8 reads + 2 safe-writes. Token auth via `X-Auth-Token` header.

Mirrors the template proven by `solomonneas/adguard-mcp` and `solomonneas/proxmox-mcp`: TypeScript, tsup bundler, write gating, dual publish to npm + ClawHub, five-client README.

## Problem

LibreNMS is the SNMP-driven network monitoring system. Operators use it to track switches, routers, servers, ports, and to alert on faults. Two existing repos (`solomonneas/watchtower`, `solomonneas/portgrid`) pull from LibreNMS for visualization, but everyday operator questions still live in the web UI:

- "Which ports reported error counters in the last hour?"
- "Are any devices unreachable right now?"
- "Acknowledge alert #42 - it's a known maintenance window."
- "Show me uplink utilization on the core switch."

None of those compose with Claude conversation today. The operator either opens LibreNMS, clicks through, and answers, or asks Claude to guess from stale `watchtower` snapshots.

This MCP fills the gap. Read tools answer the "what's the state of the network right now" questions. Two write tools cover the most common acknowledge actions.

## Goal

Ship `solomonneas/librenms-mcp@0.1.0`:

- 10 tools (8 reads + 2 safe-writes) across two tiers
- Token auth via `X-Auth-Token` header
- Single-instance (multi-instance can grow later)
- Optional `LIBRENMS_TLS_INSECURE` for self-signed certs (common in self-hosted LibreNMS)
- Tier-2 writes gated by explicit `confirm: true` arg
- Token redacted from logs and errors
- Dual publish to npm + ClawHub
- README documents Claude Desktop, Claude Code, OpenClaw, Hermes Agent, Codex CLI setup

## Non-goals

- Polling configuration changes (poller groups, intervals). Out of scope.
- Device addition/removal/edit. The MCP reads device state; web UI handles inventory changes.
- Alert rule management (create/edit/delete alert rules). Operator-side config.
- User/group management.
- API key rotation through the MCP itself.
- Polling stats database access (`/poller`, `/rrd`). Out of scope for v1.
- Custom SNMP OID queries. Use the LibreNMS UI.

## Architecture

Same layout as proxmox-mcp:

```
~/repos/librenms-mcp/
├── src/
│   ├── librenms-client.ts    # HTTP X-Auth-Token client + optional TLS-insecure dispatcher
│   ├── config.ts             # env load, validate required fields
│   ├── security.ts           # token redaction
│   ├── gates.ts              # assertConfirmedWrite for tier 2
│   ├── tools/
│   │   ├── _util.ts
│   │   ├── librenms_status.ts
│   │   ├── librenms_list_devices.ts
│   │   ├── librenms_get_device.ts
│   │   ├── librenms_list_ports.ts
│   │   ├── librenms_port_health.ts
│   │   ├── librenms_list_alerts.ts
│   │   ├── librenms_get_alert.ts
│   │   ├── librenms_alert_history.ts
│   │   ├── librenms_ack_alert.ts
│   │   ├── librenms_set_maintenance.ts
│   │   └── index.ts
├── mcp-server.ts
├── index.ts
├── openclaw.plugin.json
├── tests/
│   ├── fake-librenms.ts
│   └── tools/<one-per-tool>.test.ts
├── docs/
├── README.md
├── LICENSE
├── package.json
├── tsup.config.ts
├── tsconfig.json
└── .gitignore
```

## Tools (10 total, two tiers)

### Tier 1 reads (8, always allowed)

| Tool | Description | LibreNMS endpoint |
|---|---|---|
| `librenms_status` | System health: version, devices total, alerts active, last poll | `GET /api/v0/system` |
| `librenms_list_devices` | List monitored devices with hostname, status, last polled, vendor/os | `GET /api/v0/devices` (optionally `?type=<status>`) |
| `librenms_get_device` | Detail for one device by hostname or device_id | `GET /api/v0/devices/{hostname}` |
| `librenms_list_ports` | Ports for a device with operational/admin state, ifSpeed, error counts | `GET /api/v0/devices/{hostname}/ports?columns=ifName,ifAdminStatus,ifOperStatus,ifInErrors,ifOutErrors,ifSpeed` |
| `librenms_port_health` | Top N ports cluster-wide by inbound errors, drops, or utilization | `GET /api/v0/ports?columns=...` + client-side sort |
| `librenms_list_alerts` | Active alerts with severity, state, device, last alert text | `GET /api/v0/alerts` (optionally `?state=<n>`) |
| `librenms_get_alert` | Alert detail by id | `GET /api/v0/alerts/{id}` |
| `librenms_alert_history` | Recent alerts (closed + active) for cross-event correlation | `GET /api/v0/logs/alertlog/{?device_id}?limit=N` |

### Tier 2 safe-writes (2, require `confirm: true`)

| Tool | Description | LibreNMS endpoint |
|---|---|---|
| `librenms_ack_alert` | Acknowledge an active alert by id with optional note | `PUT /api/v0/alerts/{id}` body `{ state: 2, note: "..." }` |
| `librenms_set_maintenance` | Put a device into a maintenance window (suppresses alerts) | `POST /api/v0/devices/{hostname}/maintenance` body `{ start, duration, title?, notes? }` |

### Tier 3 destructive (deferred)

Not in v1. Device removal, alert rule deletes, and user management would belong here. Operators currently do them via the LibreNMS UI; no agent surface needed yet.

## Auth

LibreNMS API tokens. The operator creates one in the UI under their profile -> API Tokens, then sets:

```
LIBRENMS_URL=https://librenms.example.local
LIBRENMS_TOKEN=<token-string>
LIBRENMS_TLS_INSECURE=true                    # default false; toggle for self-signed
```

Auth header: `X-Auth-Token: <token>`.

The token is registered as a secret at startup so it can never bleed into error envelopes or logs.

## Write gating

Same pattern as proxmox-mcp: `assertConfirmedWrite(args, toolName)` throws unless `args.confirm === true`. Every tier-2 tool calls it at the top of its handler. JSON schema documents `confirm: true` as required on every write.

## TLS handling

LibreNMS deployments commonly use self-signed certs on home/SMB networks. The undici Agent dispatcher pattern from proxmox-mcp applies verbatim. Truthy `LIBRENMS_TLS_INSECURE` (true/1/yes, case-insensitive) sets `rejectUnauthorized: false` on the dispatcher.

## Error handling

- LibreNMS 4xx (bad token, not found) -> typed `LibreNmsClientError`
- 5xx / network -> `LibreNmsUnreachableError`, retry-once with 1s backoff
- Schema validation fail -> MCP standard validation error
- Write gate fail -> `WriteGateError`

All paths run through `redact()` before emitting. Token NEVER leaks.

## Response envelope

LibreNMS wraps responses in `{ status: "ok", <resource_key>: <data> }`. The client should strip the envelope, returning just the data the tool needs. Different endpoints use different keys (`devices`, `ports`, `alerts`, etc.) - the client doesn't try to be generic; each tool's handler knows the key for its endpoint and accesses it directly.

## Testing

- `tests/fake-librenms.ts`: in-process Node http server matching the proxmox-mcp / adguard-mcp pattern
- Per-tool tests, ~2 tests each (happy path + at least one edge case where it matters)
- Gates tests, config tests, security/redaction tests
- TLS-insecure flag construction test
- Integration smoke: boot server, assert 10 tools register, exercise one read + one write end-to-end

Target ~30-35 tests. All hermetic.

## Publish + deploy

- `npm publish --access public` under `@solomonneas/librenms-mcp` 0.1.0
- ClawHub publish via `npx clawhub package publish` from extracted tarball
- `package.json` includes the `openclaw.compat` + `openclaw.build` blocks from day one (avoid the version-burn issue learned in adguard-mcp 0.1.0)
- README documents all 5 clients
- Auto-redeploy cron entry per the operator's `repo-redeploy-system`

## Operator follow-up (build-but-don't-flip)

PR ships code + docs + tests. Operator owns:

1. Create LibreNMS API token in the UI (User -> API Access -> Generate). For first install give it read-only scope. The MCP itself enforces a write gate; LibreNMS itself enforces token scope.
2. Set `LIBRENMS_URL`, `LIBRENMS_TOKEN`, optional `LIBRENMS_TLS_INSECURE` in `~/.openclaw/workspace/.env`.
3. Wire the MCP into whichever client(s). README has setup for all five.
4. Smoke: `librenms_status` then `librenms_list_devices` to confirm reads. Then ack a known-OK alert to confirm writes.

## Acceptance criteria

1. `npm test` runs ~30-35 hermetic tests green
2. `npm run build` produces `dist/mcp-server.js` + `dist/index.js`
3. `mcp-server.ts` advertises all 10 tools via `tools/list`
4. Each Tier 2 tool rejects calls missing `confirm: true` with `WriteGateError`
5. `librenms-client.ts` redacts the token from any error path
6. README covers all 5 clients
7. `openclaw.plugin.json` validates and loads cleanly
8. `npm pack` produces a tarball under 50 KB with `dist/`, manifest, README, LICENSE only
9. `package.json.openclaw.compat` + `openclaw.build` present from v0.1.0 (no ClawHub version burn)

## Out of scope, captured

- Device add / edit / remove (v2 maybe)
- Alert rule management (v2)
- Poller config
- User/group management
- Custom SNMP queries / RRD access
- Multi-instance support (single-instance v1; flat env vars like proxmox-mcp)
- Hard alert delete

## Related context

- Template reference: `solomonneas/proxmox-mcp` v0.2.0 (most recent, most refined).
- Publish flow + version-burn lesson: `[[clawhub-cli-publish-flow]]`.
- Build-but-don't-flip: `[[feedback-build-but-dont-flip-preference]]`.
- README 5-client requirement: `[[feedback-mcp-readme-five-clients]]`.
- Test pattern: `[[mcp-tool-handler-test-pattern]]`.
- Codebase consumers of LibreNMS data: `solomonneas/watchtower`, `solomonneas/portgrid`.
