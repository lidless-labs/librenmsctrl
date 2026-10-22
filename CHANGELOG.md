# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- Bumped `@lidless-labs/effect-operator-kit` to `1505318b2625fc273c51018389e2c61677e073d7`. Tool results, including error results, are now capped at 90,000 UTF-8 bytes. An oversize result is cut with a `[truncated: output was N bytes, limit is M bytes ...]` marker and carries `structuredContent: { truncated: true, ... }`. Results under the cap keep the existing content-only, 2-space JSON shape.
- `tools/list` now carries tool annotations. The 10 reads declare `readOnlyHint: true`; the 3 confirm-gated writes (`librenms_ack_alert`, `librenms_set_maintenance`, `librenms_unmute_alert`) declare `destructiveHint: true`. `buildAllTools` throws at startup if a tool has no entry in `src/tools/annotations.ts`.
- `mcp-server.ts` and the plugin entry now register from one `buildAllTools()` list.

## [0.2.2] - 2026-10-19

### Changed
- README rewritten to the OSS adoption-upgrade standard: WHAT/WHY/HOW lede with the write-gate differentiator on the first screen, an honest work-in-progress status note, centered badges, a prominent [website](https://lidless.dev/librenms-mcp) link, a keyword-rich "What it does" section, a copy-paste MCP client config, a verified `npx` quickstart, the real 13-tool list (10 reads, 3 confirm-gated safe writes) generated from `mcp-server.ts`, and "Why not just point an agent at the LibreNMS API?" plus "What librenms-mcp is not" sections.

### Added
- `LIBRENMS_REQUEST_TIMEOUT_MS` env var for per-request HTTP timeouts (default `30000` ms, minimum `1000` ms); hung requests now fail instead of waiting indefinitely.
- Maintainer-health files: `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, GitHub issue templates (`bug.yml`, `feature.yml`, `config.yml`), and a pull-request template with a no-PII / content-guard checkbox.

### Fixed
- OpenClaw plugin entry now points at the compiled `./dist/index.js`. The previous `./index.ts` entry was not in the published package, so OpenClaw and ClawHub could not load the plugin from npm.
- `@lidless-labs/effect-operator-kit` is bundled into `dist/` instead of installed from a git dependency, so installs no longer need to build it.
- Pinned `undici` to `^7.28.0`. undici 8 requires Node >= 22.19.0, which broke the declared Node 20 support.
- The npm publish workflow and package metadata from the v0.2.1 release line are now on the default branch, and the publish job audits runtime dependencies only (`npm audit --omit=dev`).
- Refreshed the lockfile with `npm audit fix`; runtime dependencies audit clean.

## [0.2.0]

### Added
- 10 read tools (`librenms_status`, `librenms_list_devices`, `librenms_get_device`, `librenms_list_ports`, `librenms_get_port`, `librenms_port_health`, `librenms_list_alerts`, `librenms_get_alert`, `librenms_alert_history`, `librenms_event_log`).
- 3 confirm-gated safe-write tools (`librenms_ack_alert`, `librenms_unmute_alert`, `librenms_set_maintenance`), each requiring an explicit `confirm: true`.
- Three-tier write gating (open reads, confirm-gated safe writes, destructive tier deferred), TypeBox input validation on every tool call, and token redaction in all log and error output.
