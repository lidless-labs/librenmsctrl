# librenms-mcp v0.2 Design - companion tools + port detail + event log

Extends v0.1 with 4 tools that close daily-ops gaps codex flagged on the initial release: an unmute companion to ack, a remove-maintenance companion to set-maintenance, plus port detail and a distinct event log read.

## What's added

### Tier 1 reads (2)

| Tool | Description | LibreNMS endpoint |
|---|---|---|
| `librenms_get_port` | Single port detail with all columns (admin/oper state, traffic counters, error counters, transceiver if present) | `GET /api/v0/ports/{port_id}` |
| `librenms_event_log` | Recent device events from the eventlog (distinct from alertlog - covers device up/down, syslog ingestion, etc.) | `GET /api/v0/logs/eventlog/{?device_id}?limit=<n>` |

### Tier 2 safe-writes (2)

| Tool | Description | LibreNMS endpoint |
|---|---|---|
| `librenms_unmute_alert` | Unmute (un-ack) an alert by id - companion to `librenms_ack_alert` | `POST /api/v0/alerts/unmute/{id}` |
| `librenms_remove_maintenance` | End an active device maintenance window early | `DELETE /api/v0/devices/{hostname}/maintenance` |

Total tool count after v0.2: 14 (was 10).

## Args + behavior

### `librenms_get_port`

Args:
- `port_id: number` (required) - LibreNMS internal port id (from `librenms_list_ports` response rows)

Behavior: `GET /api/v0/ports/{port_id}` returns full column set including `ifAlias`, transceiver info via separate sub-endpoints. v0.2 returns the base port row only; transceiver details can be a v0.3 add.

### `librenms_event_log`

Args:
- `device_id?: number` - filter by device id (optional)
- `limit?: number` (default 25)

Path: `/logs/eventlog/{device_id}?limit=<n>` when device_id present, otherwise `/logs/eventlog?limit=<n>`. Returns `{ count, logs }`.

### `librenms_unmute_alert`

Args:
- `id: number` (required) - alert id to unmute
- `confirm: boolean` (required, must be true)

Behavior: `POST /api/v0/alerts/unmute/{id}` with empty body. Tier-2 write; assertConfirmedWrite at top.

### `librenms_remove_maintenance`

Args:
- `hostname: string` (required) - device hostname
- `confirm: boolean` (required, must be true)

Behavior: `DELETE /api/v0/devices/{hostname}/maintenance` to end the active maintenance window early. Tier-2 write; assertConfirmedWrite at top.

## Client additions

`LibreNmsClient` already has `get`/`post`/`put`. Add `delete(path)` method to support `librenms_remove_maintenance`. Mirror the implementation in proxmox-client.ts.

```typescript
async delete<T = unknown>(path: string): Promise<T> {
  return this.request<T>("DELETE", path);
}
```

Add a test asserting the DELETE method makes the right HTTP verb.

## No tier-3 in v0.2

LibreNMS truly-destructive operations (delete_device, delete_alert, delete_alert_rule) are config-management rather than daily ops. The web UI is the right surface. Defer to v0.3+ if needed.

## Tests

- 4 new per-tool tests, ~2 tests each = ~8 new tests
- 1 client DELETE test
- Integration smoke updated to assert 14 tools register

Target: ~50 tests total (41 from v0.1 + ~9 new).

## Operator follow-up (build-but-don't-flip)

PR ships code + tests + bumped version. Operator owns nothing new on the auth side - the existing read-only token covers the new reads; the existing token with write scope covers the new writes (same flat permission model as v0.1).

## Acceptance criteria

1. `npm test` ~50 tests green
2. All 14 tools register at startup
3. Each tier-2 tool rejects calls missing `confirm: true` with `WriteGateError`
4. `librenms_remove_maintenance` uses the new client.delete() method
5. README + design doc updated with v0.2 tool list

## Out of scope (deferred to v0.3+)

- Destructive tier (delete_device, delete_alert, delete_alert_rule)
- Transceiver detail sub-endpoint
- Service status (`/devices/{hostname}/services`)
- Sensor data (`/devices/{hostname}/health`)
- Device group management
- Mute/unmute alert *rules* (vs alert instances)
- Multi-instance support (still flat env vars; if multi-instance lands, follow adguard-mcp's pattern)
