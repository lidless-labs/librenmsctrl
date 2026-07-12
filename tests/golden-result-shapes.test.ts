import { describe, expect, it, vi } from "vitest";
import type { LibreNmsClient } from "../src/librenms-client.ts";
import { createLibrenmsAlertHistoryTool } from "../src/tools/librenms_alert_history.ts";
import { createLibrenmsGetAlertTool } from "../src/tools/librenms_get_alert.ts";
import { createLibrenmsGetDeviceTool } from "../src/tools/librenms_get_device.ts";
import { createLibrenmsListDevicesTool } from "../src/tools/librenms_list_devices.ts";
import { createLibrenmsPortHealthTool } from "../src/tools/librenms_port_health.ts";
import { createLibrenmsStatusTool } from "../src/tools/librenms_status.ts";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
  isError?: boolean;
};

async function execute(
  tool: { execute: (toolCallId: string, rawParams: Record<string, unknown>) => Promise<unknown> },
  params: Record<string, unknown>,
): Promise<ToolResult> {
  return (await tool.execute("golden-call", params)) as ToolResult;
}

function expectCurrentSuccessShape(result: ToolResult, payload: unknown): void {
  expect(result).toEqual({
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  });
  expect(result).not.toHaveProperty("details");
  expect(result).not.toHaveProperty("isError");
}

describe("golden successful tool result shape contracts", () => {
  it("keeps current content-only success payloads for representative tools", async () => {
    const system = { version: "24.1.0", local_hostname: "nms" };
    const device = { device_id: 7, hostname: "sw1.lan", status: 1 };
    const alert = { id: 42, hostname: "sw1.lan", state: 1, severity: "critical" };
    const log = { datetime: "2026-07-12 10:00:00", message: "alert fired" };
    const ports = [
      {
        device_id: 7,
        ifName: "Gi0/1",
        ifInErrors: 1,
        ifOutErrors: 2,
        ifSpeed: 1000,
        ifInOctets: 10,
        ifOutOctets: 20,
      },
      {
        device_id: 7,
        ifName: "Gi0/2",
        ifInErrors: 9,
        ifOutErrors: 0,
        ifSpeed: 1000,
        ifInOctets: 1,
        ifOutOctets: 1,
      },
    ];
    const client = {
      get: vi.fn(async (path: string) => {
        switch (path) {
          case "/system":
            return { status: "ok", system: [system] };
          case "/devices?type=up":
            return { status: "ok", devices: [device] };
          case "/devices/sw1.lan":
            return { status: "ok", devices: [device] };
          case "/alerts/42":
            return { status: "ok", alerts: [alert] };
          case "/logs/alertlog?limit=1":
            return { status: "ok", logs: [log] };
          case "/ports?columns=device_id,ifName,ifInErrors,ifOutErrors,ifSpeed,ifInOctets,ifOutOctets":
            return { status: "ok", ports };
          default:
            throw new Error(`unexpected path: ${path}`);
        }
      }),
    } as unknown as LibreNmsClient;
    const getClient = () => client;

    expectCurrentSuccessShape(await execute(createLibrenmsStatusTool(getClient), {}), {
      system,
    });
    expectCurrentSuccessShape(await execute(createLibrenmsListDevicesTool(getClient), { type: "up" }), {
      devices: [device],
    });
    expectCurrentSuccessShape(await execute(createLibrenmsGetDeviceTool(getClient), { hostname: "sw1.lan" }), {
      device,
    });
    expectCurrentSuccessShape(await execute(createLibrenmsGetAlertTool(getClient), { id: 42 }), {
      alert,
    });
    expectCurrentSuccessShape(await execute(createLibrenmsAlertHistoryTool(getClient), { limit: 1 }), {
      count: 1,
      logs: [log],
    });
    expectCurrentSuccessShape(await execute(createLibrenmsPortHealthTool(getClient), { limit: 1 }), {
      metric: "errors_in",
      limit: 1,
      top: [ports[1]],
    });
  });
});
