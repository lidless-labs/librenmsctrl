# librenms-mcp

MCP server exposing LibreNMS read + safe-write tools via API token auth. Three-tier write gating: reads are open, writes require `confirm: true`, destructive ops would require `confirm: true` + `destructive: true` (v1 ships tier 1 + tier 2 only; tier 3 destructive ops are deferred).

## Tools

**Reads (8):** `librenms_status`, `librenms_list_devices`, `librenms_get_device`, `librenms_list_ports`, `librenms_port_health`, `librenms_list_alerts`, `librenms_get_alert`, `librenms_alert_history`.

**Safe writes (2, require `confirm: true`):** `librenms_ack_alert`, `librenms_set_maintenance`.

**Destructive (tier 3):** not in v1. Operations like device deletion, alert rule removal, and bulk port resets are intentionally absent until the gate pattern has more field time.

## Configuration

Set the following env vars. Both credential vars are required.

```
LIBRENMS_URL=https://librenms.example.local
LIBRENMS_TOKEN=<your-api-token>

# Optional: skip TLS cert validation (homelab self-signed certs).
# Accepts true/1/yes (case-insensitive). Defaults to false.
LIBRENMS_TLS_INSECURE=false
```

Trailing slashes on `LIBRENMS_URL` are stripped. The API token is registered with the redactor on startup and masked from all log + error output.

## Install

```
npm install -g @solomonneas/librenms-mcp
```

Or run via npx:

```
npx -y @solomonneas/librenms-mcp
```

## Setup

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "librenms": {
      "command": "npx",
      "args": ["-y", "@solomonneas/librenms-mcp"],
      "env": {
        "LIBRENMS_URL": "https://librenms.example.local",
        "LIBRENMS_TOKEN": "<your-api-token>",
        "LIBRENMS_TLS_INSECURE": "false"
      }
    }
  }
}
```

### Claude Code

```bash
claude mcp add librenms -s user -- npx -y @solomonneas/librenms-mcp
```

Then export env vars in your shell (`~/.bashrc`, `~/.zshrc`) or pass `--env` flags.

### OpenClaw

Plugin loads automatically once installed. Config goes in your `~/.openclaw/openclaw.json` `plugins.entries.librenms` (or use the bundled `openclaw.plugin.json`):

```json
{
  "plugins": {
    "entries": {
      "librenms": {
        "package": "@solomonneas/librenms-mcp",
        "activation": { "onStartup": true }
      }
    }
  }
}
```

Env vars from `~/.openclaw/workspace/.env` are inherited by the plugin.

### Hermes Agent

Add to `~/.config/hermes/agents.yaml`:

```yaml
mcp_servers:
  librenms:
    command: npx
    args: ["-y", "@solomonneas/librenms-mcp"]
    env:
      LIBRENMS_URL: https://librenms.example.local
      LIBRENMS_TOKEN: <your-api-token>
      LIBRENMS_TLS_INSECURE: "false"
```

### Codex CLI

`~/.codex/config.toml`:

```toml
[mcp_servers.librenms]
command = "npx"
args = ["-y", "@solomonneas/librenms-mcp"]

[mcp_servers.librenms.env]
LIBRENMS_URL = "https://librenms.example.local"
LIBRENMS_TOKEN = "<your-api-token>"
LIBRENMS_TLS_INSECURE = "false"
```

## Safety

This MCP uses the same three-tier write-gating pattern as the rest of the `solomonneas/*-mcp` family:

- **Tier 1 (reads):** open. No confirm flag needed. Status, device + port listings, port health, alert listings, alert history.
- **Tier 2 (safe writes):** require an explicit `confirm: true` arg. The JSON schema documents this on every write tool. Alert acknowledge and device maintenance toggling live here. A hallucinated tool call without the confirm flag throws `WriteGateError` before any HTTP traffic.
- **Tier 3 (destructive):** not implemented in v1. When added, ops like device deletion, alert rule removal, and bulk port resets will additionally require `destructive: true`. The model cannot bypass either gate from a hallucinated call.

**API token scope recommendation:** start with a "Read Only" token role in LibreNMS (Settings > API > New API Token > Read Only) and verify the read tools work end-to-end. Grade up to "Normal User" or "Global Read/Write" only after you've confirmed the redactor is masking your token in your transcripts and that the model is honoring the confirm gate. Tokens can be revoked instantly from the same Settings > API screen.

The `LIBRENMS_TLS_INSECURE=true` toggle exists for homelab self-signed certs. Leave it `false` in any environment with a real CA-signed cert.

## License

MIT
