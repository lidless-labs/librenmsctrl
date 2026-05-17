# librenms-mcp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development (implementer-only, opus). Steps use `- [ ]` checkboxes.

**Goal:** Ship `solomonneas/librenms-mcp@0.1.0` - 10 tools (8 read + 2 safe-write) for LibreNMS network monitoring. Dual-publish to npm + ClawHub from day one.

**Architecture:** Mirrors `solomonneas/proxmox-mcp` (most recent template). TypeScript + `@modelcontextprotocol/sdk` + TypeBox + vitest + tsup. Single-instance v1. `X-Auth-Token` header auth. Optional TLS-insecure dispatcher via undici Agent. Tier-2 writes gated by `confirm: true`. No tier-3 destructive.

**Tech Stack:** TypeScript 6, `@modelcontextprotocol/sdk` ^1.29, `@sinclair/typebox` ^0.34, vitest ^4, tsup ^8, openclaw ^2026.4.22 (peerDep).

---

## File Structure

**Create:**
- `package.json` (with `openclaw.compat` + `openclaw.build` from day one), `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`
- `src/config.ts` - single-instance env + TLS toggle
- `src/librenms-client.ts` - HTTP `X-Auth-Token` client + undici dispatcher for TLS-insecure
- `src/security.ts` - token redaction (copy from proxmox-mcp)
- `src/gates.ts` - assertConfirmedWrite (copy from proxmox-mcp)
- `src/tools/_util.ts`, `src/tools/<one-per-tool>.ts` (10), `src/tools/index.ts`
- `mcp-server.ts`, `index.ts`, `openclaw.plugin.json`
- `tests/fake-librenms.ts` + per-tool tests + `tests/integration.test.ts`
- `README.md`, `LICENSE`

---

## Phase 1: Scaffolding

### Task 1: package.json + build config (mirror proxmox-mcp exactly)

**Files:** Create `package.json`, `tsconfig.json`, `tsup.config.ts`, `vitest.config.ts`.

- [ ] **Step 1: Write package.json**

Copy `~/repos/proxmox-mcp/package.json` and substitute:
- `name`: `@solomonneas/librenms-mcp`
- `description`: `MCP server exposing LibreNMS read + safe-write tools`
- `bin`: `{ "librenms-mcp": "./dist/mcp-server.js" }`
- `repository.url`: `https://github.com/solomonneas/librenms-mcp`

Keep the same scripts, deps, peerDeps, devDeps, `openclaw.compat` + `openclaw.build` blocks (`openclawVersion: "2026.5.17"`, `pluginSdkVersion: "2026.5.17"`).

- [ ] **Step 2-4: tsconfig.json, tsup.config.ts, vitest.config.ts**

Copy from proxmox-mcp verbatim. Same `types: ["node"]`, same `external: [/^openclaw(\/|$)/]`, same vitest include glob.

- [ ] **Step 5: Install + commit**

```bash
cd ~/repos/librenms-mcp
npm install 2>&1 | tail -3
git add package.json package-lock.json tsconfig.json tsup.config.ts vitest.config.ts
git commit -m "chore: scaffold package + build config"
```

---

### Task 2: config.ts + tests

**Files:** `src/config.ts`, `tests/config.test.ts`.

- [ ] **Step 1: Write tests/config.test.ts** (7 tests, mirror proxmox-mcp's pattern)

```typescript
import { describe, it, expect } from "vitest";
import { resolveConfig, ConfigError } from "../src/config.ts";

describe("resolveConfig", () => {
  it("parses required env", () => {
    const cfg = resolveConfig({
      LIBRENMS_URL: "https://librenms.local",
      LIBRENMS_TOKEN: "abc123",
    });
    expect(cfg.url).toBe("https://librenms.local");
    expect(cfg.token).toBe("abc123");
    expect(cfg.tlsInsecure).toBe(false);
  });

  it("parses TLS-insecure flag (true/1/yes case-insensitive)", () => {
    for (const v of ["true", "True", "1", "yes", "YES"]) {
      const cfg = resolveConfig({
        LIBRENMS_URL: "https://x",
        LIBRENMS_TOKEN: "t",
        LIBRENMS_TLS_INSECURE: v,
      });
      expect(cfg.tlsInsecure).toBe(true);
    }
  });

  it("TLS-insecure defaults false on falsy values", () => {
    for (const v of ["false", "0", "no", "", undefined]) {
      const cfg = resolveConfig({
        LIBRENMS_URL: "https://x",
        LIBRENMS_TOKEN: "t",
        ...(v === undefined ? {} : { LIBRENMS_TLS_INSECURE: v }),
      });
      expect(cfg.tlsInsecure).toBe(false);
    }
  });

  it("throws ConfigError on missing LIBRENMS_URL", () => {
    expect(() => resolveConfig({ LIBRENMS_TOKEN: "t" })).toThrow(ConfigError);
  });

  it("throws ConfigError on missing LIBRENMS_TOKEN", () => {
    expect(() => resolveConfig({ LIBRENMS_URL: "https://x" })).toThrow(ConfigError);
  });

  it("strips trailing slash from LIBRENMS_URL", () => {
    const cfg = resolveConfig({
      LIBRENMS_URL: "https://librenms.local/",
      LIBRENMS_TOKEN: "t",
    });
    expect(cfg.url).toBe("https://librenms.local");
  });
});
```

- [ ] **Step 2: Implement src/config.ts** (verbatim copy of proxmox-mcp's structure with `LIBRENMS_*` instead of `PROXMOX_*` and `token` instead of `tokenId/tokenSecret`):

```typescript
export interface LibreNmsConfig {
  url: string;
  token: string;
  tlsInsecure: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  return ["true", "1", "yes"].includes(value.toLowerCase());
}

export function resolveConfig(env: Record<string, string | undefined>): LibreNmsConfig {
  const url = env.LIBRENMS_URL;
  const token = env.LIBRENMS_TOKEN;
  if (!url) throw new ConfigError("LIBRENMS_URL is required");
  if (!token) throw new ConfigError("LIBRENMS_TOKEN is required");
  return {
    url: url.replace(/\/+$/, ""),
    token,
    tlsInsecure: isTruthy(env.LIBRENMS_TLS_INSECURE),
  };
}
```

- [ ] **Step 3: Run green + commit**

```bash
npx vitest run tests/config.test.ts 2>&1 | tail -5
git add src/config.ts tests/config.test.ts
git commit -m "feat(config): env resolution + TLS toggle"
```

---

### Task 3: librenms-client.ts + security + gates + fake server

**Files:**
- Create: `src/librenms-client.ts`, `src/security.ts`, `src/gates.ts`, `tests/fake-librenms.ts`, `tests/client.test.ts`, `tests/security.test.ts`, `tests/gates.test.ts`

- [ ] **Step 1: tests/fake-librenms.ts**

Copy `~/repos/proxmox-mcp/tests/fake-proxmox.ts` verbatim, rename interface to `FakeLibreNms` and export `startFakeLibreNms`. Same in-process http server with route + request capture.

- [ ] **Step 2: src/security.ts**

Copy `~/repos/proxmox-mcp/src/security.ts` verbatim. The base64-token-detection logic also applies to bearer-style tokens.

- [ ] **Step 3: src/gates.ts**

Copy `~/repos/proxmox-mcp/src/gates.ts` verbatim. `WriteGateError` + `assertConfirmedWrite` only.

- [ ] **Step 4: tests/security.test.ts** + **tests/gates.test.ts**

Copy from proxmox-mcp, replacing references to `proxmox_*` tool names with `librenms_*` (e.g. `librenms_ack_alert`).

- [ ] **Step 5: tests/client.test.ts**

```typescript
import { describe, it, expect, afterEach } from "vitest";
import { startFakeLibreNms, FakeLibreNms } from "./fake-librenms.ts";
import { LibreNmsClient, LibreNmsClientError, LibreNmsUnreachableError } from "../src/librenms-client.ts";

let fake: FakeLibreNms | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });

describe("LibreNmsClient", () => {
  it("sends X-Auth-Token header", async () => {
    fake = await startFakeLibreNms([
      { method: "GET", path: "/api/v0/system", status: 200, body: { status: "ok", system: [{ version: "23.11.0" }] } },
    ]);
    const c = new LibreNmsClient({ url: fake.baseUrl, token: "secret-token", tlsInsecure: false });
    const r = await c.get<unknown>("/system");
    expect(r).toBeDefined();
    expect(fake.requests[0].path).toBe("/api/v0/system");
    expect(fake.requests[0].headers["x-auth-token"]).toBe("secret-token");
  });

  it("throws LibreNmsClientError on 401", async () => {
    fake = await startFakeLibreNms([
      { method: "GET", path: "/api/v0/system", status: 401, body: { status: "error", message: "bad token" } },
    ]);
    const c = new LibreNmsClient({ url: fake.baseUrl, token: "bad", tlsInsecure: false });
    await expect(c.get("/system")).rejects.toThrow(LibreNmsClientError);
  });

  it("retries once on 5xx then throws Unreachable", async () => {
    fake = await startFakeLibreNms([
      { method: "GET", path: "/api/v0/system", status: 502, body: { status: "error" } },
    ]);
    const c = new LibreNmsClient({ url: fake.baseUrl, token: "t", tlsInsecure: false }, { retryDelayMs: 5 });
    await expect(c.get("/system")).rejects.toThrow(LibreNmsUnreachableError);
    expect(fake.requests).toHaveLength(2);
  });

  it("does not include token in thrown error messages", async () => {
    fake = await startFakeLibreNms([
      { method: "GET", path: "/api/v0/system", status: 401, body: { status: "error", message: "unauthorized" } },
    ]);
    const c = new LibreNmsClient({ url: fake.baseUrl, token: "super-secret-token", tlsInsecure: false });
    try {
      await c.get("/system");
    } catch (e) {
      expect((e as Error).message).not.toContain("super-secret-token");
    }
  });

  it("posts JSON body", async () => {
    fake = await startFakeLibreNms([
      { method: "PUT", path: "/api/v0/alerts/42", status: 200, body: { status: "ok" } },
    ]);
    const c = new LibreNmsClient({ url: fake.baseUrl, token: "t", tlsInsecure: false });
    await c.put("/alerts/42", { state: 2, note: "ack" });
    expect(fake.requests[0].method).toBe("PUT");
    const body = JSON.parse(fake.requests[0].body);
    expect(body.state).toBe(2);
    expect(body.note).toBe("ack");
  });
});
```

Note: the fake-librenms harness needs to capture ALL request headers (lowercase the keys), not just the auth header. Update `tests/fake-librenms.ts` to capture `headers: Record<string, string>` (lowercased) instead of `authHeader` only.

- [ ] **Step 6: Implement src/librenms-client.ts**

Copy proxmox-client.ts and adapt:
- Replace `authHeader = \`PVEAPIToken=...\`` with `xAuthToken = cfg.token`
- Inject as `'x-auth-token': xAuthToken` header
- API base path is `/api/v0` (not `/api2/json`)
- LibreNMS POST/PUT bodies are JSON (not form-encoded - that was a PVE quirk)
- Add `put<T>(path, body)` method since LibreNMS uses PUT for alert acks
- Class names: `LibreNmsClient`, `LibreNmsClientError`, `LibreNmsUnreachableError`
- TLS-insecure undici dispatcher pattern unchanged

```typescript
import { Agent as UndiciAgent } from "undici";

export interface LibreNmsClientOptions {
  retryDelayMs?: number;
}

export class LibreNmsClientError extends Error {
  constructor(public status: number, message: string) {
    super(`LibreNMS ${status}: ${message}`);
    this.name = "LibreNmsClientError";
  }
}

export class LibreNmsUnreachableError extends Error {
  constructor(cause: string) {
    super(`LibreNMS unreachable: ${cause}`);
    this.name = "LibreNmsUnreachableError";
  }
}

export interface ClientInstanceConfig {
  url: string;
  token: string;
  tlsInsecure: boolean;
}

export class LibreNmsClient {
  private retryDelayMs: number;
  private dispatcher?: UndiciAgent;

  constructor(private cfg: ClientInstanceConfig, opts: LibreNmsClientOptions = {}) {
    this.retryDelayMs = opts.retryDelayMs ?? 1000;
    if (cfg.tlsInsecure && cfg.url.startsWith("https://")) {
      this.dispatcher = new UndiciAgent({ connect: { rejectUnauthorized: false } });
    }
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = this.cfg.url + "/api/v0" + path;
    const headers: Record<string, string> = { "x-auth-token": this.cfg.token };
    let bodyStr: string | undefined;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      bodyStr = JSON.stringify(body);
    }
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const init: Record<string, unknown> = { method, headers, body: bodyStr };
        if (this.dispatcher) init.dispatcher = this.dispatcher;
        const res = await fetch(url, init as RequestInit);
        if (res.status >= 200 && res.status < 300) {
          const text = await res.text();
          if (!text) return undefined as T;
          return JSON.parse(text) as T;
        }
        if (res.status >= 500) {
          lastErr = new LibreNmsUnreachableError(`HTTP ${res.status}`);
          if (attempt === 0) await sleep(this.retryDelayMs);
          continue;
        }
        const errText = await res.text();
        let msg = errText;
        try { msg = (JSON.parse(errText) as { message?: string }).message ?? errText; } catch {}
        throw new LibreNmsClientError(res.status, msg);
      } catch (e) {
        if (e instanceof LibreNmsClientError) throw e;
        lastErr = new LibreNmsUnreachableError((e as Error).message);
        if (attempt === 0) await sleep(this.retryDelayMs);
      }
    }
    throw lastErr ?? new LibreNmsUnreachableError("unknown");
  }
}

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }
```

Key difference from proxmox-client: LibreNMS does NOT strip a `data` envelope - each endpoint returns `{ status: "ok", <resource_key>: ... }` and the client returns the full object. Tool handlers index into the right key (`.devices`, `.ports`, `.alerts`, etc.) themselves. This keeps the client thin and avoids guessing the key per endpoint.

- [ ] **Step 7: Run green + commit**

```bash
npm test 2>&1 | tail -5
git add src tests
git commit -m "feat(client): librenms client + security + gates + fake server"
```

---

## Phase 2: Read tools (Tier 1)

### Task 4: 8 tier-1 read tools

Implement each tool + a per-tool test. Each tool follows the pattern in `~/repos/proxmox-mcp/src/tools/proxmox_status.ts`.

- [ ] **Step 1: Write src/tools/_util.ts** (simpler than proxmox - no resolveResource needed):

```typescript
import type { LibreNmsClient } from "../librenms-client.ts";

export type ClientFactory = () => LibreNmsClient;

export function jsonToolResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}
```

- [ ] **Step 2: Implement each tool + test**

Endpoints and shapes:

| Tool | Path | Args | Response key |
|---|---|---|---|
| `librenms_status` | `GET /system` | (none) | `system` (array of one object) |
| `librenms_list_devices` | `GET /devices` | `type?: 'all'\|'up'\|'down'\|'ignored'\|'disabled'` (default 'all') | `devices` |
| `librenms_get_device` | `GET /devices/{hostname}` | `hostname: string` | `devices` (array of one) |
| `librenms_list_ports` | `GET /devices/{hostname}/ports?columns=ifName,ifAdminStatus,ifOperStatus,ifInErrors,ifOutErrors,ifSpeed,ifDescr` | `hostname: string` | `ports` |
| `librenms_port_health` | `GET /ports?columns=device_id,ifName,ifInErrors,ifOutErrors,ifSpeed` then client-side sort + limit | `limit?: number` (default 10), `metric?: 'errors_in'\|'errors_out'\|'utilization'` (default 'errors_in') | computed |
| `librenms_list_alerts` | `GET /alerts` (optionally `?state=<n>` where 0=ok, 1=active, 2=ack) | `state?: 0\|1\|2` | `alerts` |
| `librenms_get_alert` | `GET /alerts/{id}` | `id: number` | `alerts` (array of one) |
| `librenms_alert_history` | `GET /logs/alertlog/{?device_id}?limit=<n>` | `device_id?: number`, `limit?: number` (default 25) | `logs` |

Per-tool test template:

```typescript
// tests/tools/<name>.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { startFakeLibreNms, FakeLibreNms } from "../fake-librenms.ts";
import { LibreNmsClient } from "../../src/librenms-client.ts";
import { createLibrenms<Name>Tool } from "../../src/tools/librenms_<name>.ts";

let fake: FakeLibreNms | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });

describe("librenms_<name>", () => {
  it("returns expected payload", async () => {
    fake = await startFakeLibreNms([
      { method: "GET", path: "/api/v0/<endpoint>", status: 200, body: { status: "ok", <key>: [...] } },
    ]);
    const tool = createLibrenms<Name>Tool(
      () => new LibreNmsClient({ url: fake!.baseUrl, token: "t", tlsInsecure: false }),
    );
    const r = await tool.execute(<args>);
    const payload = JSON.parse(r.content[0].text);
    expect(payload.<expected>).toBe(<value>);
  });
});
```

Sample tool body for `librenms_status`:

```typescript
import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { jsonToolResult } from "./_util.ts";

const Schema = Type.Object({}, { additionalProperties: false });

export function createLibrenmsStatusTool(getClient: ClientFactory) {
  return {
    name: "librenms_status",
    label: "librenms: status",
    description: "LibreNMS system health (version, totals, last poll) via GET /api/v0/system.",
    parameters: Schema,
    execute: async () => {
      const client = getClient();
      const r = await client.get<{ status: string; system: Array<Record<string, unknown>> }>("/system");
      return jsonToolResult({ system: r.system?.[0] ?? null });
    },
  };
}
```

For `librenms_port_health`, the implementation does client-side sort of all ports by the requested metric:

```typescript
execute: async (_id: string, raw: Record<string, unknown>) => {
  const args = raw as { limit?: number; metric?: "errors_in" | "errors_out" | "utilization" };
  const limit = args.limit ?? 10;
  const metric = args.metric ?? "errors_in";
  const client = getClient();
  const r = await client.get<{ status: string; ports: Array<Record<string, unknown>> }>("/ports?columns=device_id,ifName,ifInErrors,ifOutErrors,ifSpeed,ifInOctets,ifOutOctets");
  const ports = (r.ports ?? []) as Array<{ device_id: number; ifName: string; ifInErrors?: number; ifOutErrors?: number; ifSpeed?: number; ifInOctets?: number; ifOutOctets?: number }>;
  const sorted = ports.sort((a, b) => {
    if (metric === "errors_in") return (b.ifInErrors ?? 0) - (a.ifInErrors ?? 0);
    if (metric === "errors_out") return (b.ifOutErrors ?? 0) - (a.ifOutErrors ?? 0);
    // utilization: rough %, (octets / speed) - we don't have window, just a static read
    const aUtil = a.ifSpeed ? ((a.ifInOctets ?? 0) + (a.ifOutOctets ?? 0)) / a.ifSpeed : 0;
    const bUtil = b.ifSpeed ? ((b.ifInOctets ?? 0) + (b.ifOutOctets ?? 0)) / b.ifSpeed : 0;
    return bUtil - aUtil;
  });
  return jsonToolResult({ metric, limit, top: sorted.slice(0, limit) });
},
```

For `librenms_alert_history`, the path uses optional device_id segment:

```typescript
execute: async (_id: string, raw: Record<string, unknown>) => {
  const args = raw as { device_id?: number; limit?: number };
  const limit = args.limit ?? 25;
  const path = args.device_id ? `/logs/alertlog/${args.device_id}?limit=${limit}` : `/logs/alertlog?limit=${limit}`;
  const client = getClient();
  const r = await client.get<{ status: string; logs: Array<Record<string, unknown>> }>(path);
  return jsonToolResult({ count: r.logs?.length ?? 0, logs: r.logs ?? [] });
},
```

- [ ] **Step 3: Run all read-tool tests + commit**

```bash
npm test 2>&1 | tail -5
git add src/tools tests/tools
git commit -m "feat(tools): 8 tier-1 read tools (status + devices + ports + alerts)"
```

---

## Phase 3: Write tools (Tier 2)

### Task 5: 2 tier-2 safe-write tools

Both call `assertConfirmedWrite(raw, NAME)` at the top of `execute`.

- [ ] **Step 1: librenms_ack_alert**

```typescript
import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { jsonToolResult } from "./_util.ts";
import { assertConfirmedWrite } from "../gates.ts";

const Schema = Type.Object({
  id: Type.Integer({ minimum: 1, description: "Alert id to acknowledge." }),
  note: Type.Optional(Type.String({ description: "Optional acknowledgement note." })),
  confirm: Type.Boolean({ description: "Must be true to write. Tier-2 safe-write gate." }),
}, { additionalProperties: false });

const NAME = "librenms_ack_alert";

export function createLibrenmsAckAlertTool(getClient: ClientFactory) {
  return {
    name: NAME,
    label: "librenms: ack alert",
    description: "Acknowledge an active alert by id via PUT /api/v0/alerts/{id} with state=2. Tier-2 write; requires confirm:true.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      assertConfirmedWrite(raw, NAME);
      const args = raw as { id: number; note?: string };
      const client = getClient();
      const body: Record<string, unknown> = { state: 2 };
      if (args.note) body.note = args.note;
      const r = await client.put(`/alerts/${args.id}`, body);
      return jsonToolResult({ alert_id: args.id, acked: true, response: r });
    },
  };
}
```

- [ ] **Step 2: librenms_set_maintenance**

```typescript
import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { jsonToolResult } from "./_util.ts";
import { assertConfirmedWrite } from "../gates.ts";

const Schema = Type.Object({
  hostname: Type.String({ description: "Device hostname or IP as configured in LibreNMS." }),
  duration: Type.String({ description: "Maintenance duration, e.g. '2h', '30m'. Format: '<N>h' or '<N>m'." }),
  title: Type.Optional(Type.String({ description: "Maintenance window title." })),
  notes: Type.Optional(Type.String({ description: "Free-text notes." })),
  start: Type.Optional(Type.String({ description: "ISO start time. Default: now." })),
  confirm: Type.Boolean({ description: "Must be true to write. Tier-2 safe-write gate." }),
}, { additionalProperties: false });

const NAME = "librenms_set_maintenance";

export function createLibrenmsSetMaintenanceTool(getClient: ClientFactory) {
  return {
    name: NAME,
    label: "librenms: set maintenance",
    description: "Put a device into a maintenance window (suppresses alerts) via POST /api/v0/devices/{hostname}/maintenance. Tier-2 write; requires confirm:true.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      assertConfirmedWrite(raw, NAME);
      const args = raw as { hostname: string; duration: string; title?: string; notes?: string; start?: string };
      const client = getClient();
      const body: Record<string, unknown> = { duration: args.duration };
      if (args.title) body.title = args.title;
      if (args.notes) body.notes = args.notes;
      if (args.start) body.start = args.start;
      const r = await client.post(`/devices/${encodeURIComponent(args.hostname)}/maintenance`, body);
      return jsonToolResult({ hostname: args.hostname, maintenance: r });
    },
  };
}
```

- [ ] **Step 3: Tests for both**

Each tool gets 2 tests:
- Refuses without confirm → throws WriteGateError
- With confirm: writes to correct endpoint with correct body shape

- [ ] **Step 4: Commit**

```bash
npm test 2>&1 | tail -5
git add src/tools tests/tools
git commit -m "feat(tools): 2 tier-2 write tools (ack alert + set maintenance)"
```

---

## Phase 4: Plugin entry + MCP server + manifest

### Task 6: tools/index.ts + index.ts + mcp-server.ts + openclaw.plugin.json

Mirror `~/repos/proxmox-mcp/index.ts` + `mcp-server.ts` + `openclaw.plugin.json`. Substitute:
- 10 tool factories instead of 14
- Plugin id `librenms`, name `LibreNMS`
- Register the token as a secret (just one string - simpler than proxmox)

- [ ] **Step 1: src/tools/index.ts** - re-export all 10 factories
- [ ] **Step 2: index.ts** - definePluginEntry + `withRedactedErrors` wrapper + registerSecret(token)
- [ ] **Step 3: mcp-server.ts** - stdio server, 10 tools, redact in handler
- [ ] **Step 4: openclaw.plugin.json** - id `librenms`, version `0.1.0`, entry `./dist/index.js`
- [ ] **Step 5: typecheck + build + commit**

```bash
npm run typecheck && npm run build
git add src/tools/index.ts index.ts mcp-server.ts openclaw.plugin.json
git commit -m "feat(server): MCP entry + OpenClaw plugin + 10-tool registration"
```

---

### Task 7: README + LICENSE

Mirror proxmox-mcp's README, substitute librenms-specific:
- 8 reads + 2 writes table
- Config: `LIBRENMS_URL`, `LIBRENMS_TOKEN`, `LIBRENMS_TLS_INSECURE`
- Install: `npx -y @solomonneas/librenms-mcp`
- Generic examples: `https://librenms.example.local` and a placeholder token
- 5-client setup blocks
- Safety section: token scope recommendation (start read-only)

Commit:

```bash
git add README.md LICENSE
git commit -m "docs: README with 5-client setup + LICENSE"
```

---

### Task 8: Integration smoke + leak scan + commit

`tests/integration.test.ts`:
- All 10 tools register with unique names matching `^librenms_`
- End-to-end status + ack_alert via fake server

Final leak scan:
```bash
find . -type f \( -name "*.ts" -o -name "*.json" -o -name "*.md" \) -not -path "./node_modules/*" -not -path "./dist/*" -not -path "./.git/*" | xargs grep -lE "automation-host|windows-host|proxmox-host|example-user|clawdbot|192\.168\.4\.|example-user|ms\.example-user|REDACTED-PASSWORD" 2>/dev/null || echo "clean"
```

```bash
npm test 2>&1 | tail -5
git add tests/integration.test.ts
git commit -m "test: integration smoke (10 tools + end-to-end)"
```

---

## Phase 5: Codex review + Publish

### Task 9: Codex review

Same flow as proxmox-mcp: capture full diff, ask Codex for blocking + important + nits across: token leakage, write-gate bypass, public-repo readiness, tool-surface gaps, anything the prior reviews would flag.

If blockers surface: fix + push, then re-publish steps. Likely the same class of issues as proxmox (form encoding, TLS, fixture sanitization) - the proxmox lessons will largely apply.

### Task 10: GitHub repo + push + dual publish + tag

```bash
cd ~/repos/librenms-mcp
gh repo create solomonneas/librenms-mcp --public --description "MCP server for LibreNMS: 10 tools for network monitoring (devices, ports, alerts, ack, maintenance)" --source . --remote origin --push=false
git push -u origin master
git tag -a v0.1.0 -m "v0.1.0 - initial public release"
git push origin v0.1.0

# npm
npm publish --access public

# ClawHub
npm pack
SHA=$(git rev-parse HEAD)
rm -rf /tmp/clawhub-librenms
mkdir -p /tmp/clawhub-librenms
tar -xzf solomonneas-librenms-mcp-0.1.0.tgz -C /tmp/clawhub-librenms
cd /tmp/clawhub-librenms/package
npx clawhub --workdir . package publish . \
  --family code-plugin \
  --version 0.1.0 \
  --tags "latest,mcp,librenms,monitoring,network,snmp" \
  --source-repo solomonneas/librenms-mcp \
  --source-commit "$SHA" \
  --source-ref master \
  --changelog "Initial public release. 8 read + 2 write tools. Token auth via X-Auth-Token, undici TLS-insecure dispatcher, redaction of token in errors."
```

### Task 11: Profile README

Add to `~/repos/solomonneas-profile/README.md` under MCP Servers section, after proxmox-mcp:

```
- 📡 [librenms-mcp](https://github.com/solomonneas/librenms-mcp) - LibreNMS network monitoring control with 10 tools: device + port + alert reads, port health rankings, alert ack, maintenance windows. Token auth, undici TLS-insecure dispatcher.
```

Commit + push.

---

## Self-review

Spec coverage: every spec acceptance criterion maps to a task. Read tools: Task 4. Write tools: Task 5. Server entry: Task 6. README: Task 7. Integration smoke: Task 8. Codex review: Task 9. Publish: Task 10. Profile: Task 11.

Placeholder scan: no TBDs. Forward references explicit.

Type consistency: `ClientFactory = () => LibreNmsClient`, `LibreNmsConfig` shape stable, all tool factories return `{name, label, description, parameters, execute}`.

---

## Execution

After all tasks land:

```bash
npm test
npm run build
gh repo view solomonneas/librenms-mcp
npm view @solomonneas/librenms-mcp version
```
