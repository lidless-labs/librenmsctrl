import { describe, expect, it, vi } from "vitest";
import { UsageError, parseArgs, run, type CliDeps } from "../src/cli.ts";
import type { LibreNmsClient } from "../src/librenms-client.ts";

function capture(
  client: Partial<LibreNmsClient>,
  serve = vi.fn().mockResolvedValue(undefined),
) {
  const out: string[] = [];
  const err: string[] = [];
  const deps: CliDeps = {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    makeClient: () => client as LibreNmsClient,
    serve,
  };
  return { out, err, deps, serve };
}

describe("parseArgs", () => {
  it("routes status", () => {
    expect(parseArgs(["status"])).toEqual({ kind: "status", json: false });
    expect(parseArgs(["status", "--json"])).toEqual({ kind: "status", json: true });
  });

  it("routes devices list with a type filter", () => {
    expect(parseArgs(["devices", "list"])).toEqual({
      kind: "devices-list",
      json: false,
      type: undefined,
    });
    expect(parseArgs(["devices", "list", "--type", "down", "--json"])).toEqual({
      kind: "devices-list",
      json: true,
      type: "down",
    });
  });

  it("routes devices get with a hostname", () => {
    expect(parseArgs(["devices", "get", "core-sw1"])).toEqual({
      kind: "devices-get",
      json: false,
      hostname: "core-sw1",
    });
  });

  it("routes ports subcommands", () => {
    expect(parseArgs(["ports", "list", "core-sw1"])).toEqual({
      kind: "ports-list",
      json: false,
      hostname: "core-sw1",
    });
    expect(parseArgs(["ports", "get", "42"])).toEqual({
      kind: "ports-get",
      json: false,
      portId: 42,
    });
    expect(parseArgs(["ports", "health", "--metric", "errors_out", "--limit", "5"])).toEqual({
      kind: "ports-health",
      json: false,
      metric: "errors_out",
      limit: 5,
    });
  });

  it("routes alerts subcommands", () => {
    expect(parseArgs(["alerts", "list", "--state", "1"])).toEqual({
      kind: "alerts-list",
      json: false,
      state: 1,
    });
    expect(parseArgs(["alerts", "get", "7"])).toEqual({
      kind: "alerts-get",
      json: false,
      id: 7,
    });
    expect(parseArgs(["alerts", "history", "--device-id", "3", "--limit", "10"])).toEqual({
      kind: "alerts-history",
      json: false,
      deviceId: 3,
      limit: 10,
    });
  });

  it("routes events list", () => {
    expect(parseArgs(["events", "list", "--limit", "50"])).toEqual({
      kind: "events-list",
      json: false,
      deviceId: undefined,
      limit: 50,
    });
  });

  it("routes help and version", () => {
    expect(parseArgs([])).toEqual({ kind: "help" });
    expect(parseArgs(["help"])).toEqual({ kind: "help" });
    expect(parseArgs(["--help"])).toEqual({ kind: "help" });
    expect(parseArgs(["-v"])).toEqual({ kind: "version" });
    expect(parseArgs(["mcp"])).toEqual({ kind: "mcp" });
  });

  it("rejects bad input with UsageError", () => {
    expect(() => parseArgs(["bogus"])).toThrow(UsageError);
    expect(() => parseArgs(["devices"])).toThrow(UsageError);
    expect(() => parseArgs(["devices", "bogus"])).toThrow(UsageError);
    expect(() => parseArgs(["devices", "get"])).toThrow(UsageError);
    expect(() => parseArgs(["ports", "get", "notanint"])).toThrow(UsageError);
    expect(() => parseArgs(["ports", "get", "0"])).toThrow(UsageError);
    expect(() => parseArgs(["alerts", "list", "--state", "9"])).toThrow(UsageError);
    expect(() => parseArgs(["ports", "health", "--metric", "bogus"])).toThrow(UsageError);
    expect(() => parseArgs(["devices", "list", "extra"])).toThrow(UsageError);
    expect(() => parseArgs(["status", "--bogus"])).toThrow(UsageError);
  });
});

describe("run", () => {
  it("prints human status output and exits 0", async () => {
    const client = {
      get: vi.fn().mockResolvedValue({
        status: "ok",
        system: [{ local_hostname: "nms", version: "24.1.0", db_schema: 300 }],
      }),
    };
    const { out, deps } = capture(client);
    const code = await run(["status"], deps);
    expect(code).toBe(0);
    expect(client.get).toHaveBeenCalledWith("/system");
    const text = out.join("\n");
    expect(text).toContain("24.1.0");
  });

  it("emits raw JSON with --json", async () => {
    const sys = { status: "ok", system: [{ version: "24.1.0" }] };
    const client = { get: vi.fn().mockResolvedValue(sys) };
    const { out, deps } = capture(client);
    const code = await run(["status", "--json"], deps);
    expect(code).toBe(0);
    expect(JSON.parse(out.join("\n"))).toEqual({ system: { version: "24.1.0" } });
  });

  it("lists devices and passes the type filter through", async () => {
    const client = {
      get: vi.fn().mockResolvedValue({
        status: "ok",
        devices: [{ hostname: "sw1", device_id: 1, status: 1, os: "ios" }],
      }),
    };
    const { out, deps } = capture(client);
    const code = await run(["devices", "list", "--type", "up"], deps);
    expect(code).toBe(0);
    expect(client.get).toHaveBeenCalledWith("/devices?type=up");
    expect(out.join("\n")).toContain("sw1");
  });

  it("ranks ports health client-side", async () => {
    const client = {
      get: vi.fn().mockResolvedValue({
        status: "ok",
        ports: [
          { device_id: 1, ifName: "Gi0/1", ifInErrors: 2 },
          { device_id: 1, ifName: "Gi0/2", ifInErrors: 99 },
        ],
      }),
    };
    const { out, deps } = capture(client);
    const code = await run(["ports", "health", "--limit", "1"], deps);
    expect(code).toBe(0);
    const text = out.join("\n");
    expect(text).toContain("Gi0/2");
    expect(text).not.toContain("Gi0/1");
  });

  it("status returns exit 1 when the system list is empty", async () => {
    const client = { get: vi.fn().mockResolvedValue({ status: "ok", system: [] }) };
    const { deps } = capture(client);
    expect(await run(["status"], deps)).toBe(1);
  });

  it("returns exit 1 and prints a redacted error on client failure", async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error("LibreNMS unreachable: connect ECONNREFUSED")),
    };
    const { err, deps } = capture(client);
    expect(await run(["devices", "list"], deps)).toBe(1);
    expect(err.join("\n")).toContain("unreachable");
  });

  it("stringifies degenerate thrown values with the pre-kit boundary rules", async () => {
    const cases: Array<{ thrown: unknown; stderr: string }> = [
      { thrown: new Error(""), stderr: "" },
      { thrown: 42, stderr: "42" },
    ];

    for (const { thrown, stderr } of cases) {
      const client = { get: vi.fn().mockRejectedValue(thrown) };
      const captured = capture(client);

      expect(await run(["devices", "list"], captured.deps)).toBe(1);
      expect(captured.err).toEqual([stderr]);
    }
  });

  it("returns exit 2 and prints help on usage error", async () => {
    const { err, deps } = capture({});
    expect(await run(["bogus"], deps)).toBe(2);
    expect(err.join("\n")).toContain("Usage:");
  });

  it("delegates `mcp` to serve()", async () => {
    const { deps, serve } = capture({});
    expect(await run(["mcp"], deps)).toBe(0);
    expect(serve).toHaveBeenCalledOnce();
  });
});
