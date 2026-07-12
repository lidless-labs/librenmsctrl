import { describe, expect, it, vi } from "vitest";
import { pluginErrorResult, withRedactedErrors } from "../index.ts";
import { mcpErrorResult } from "../mcp-server.ts";
import type { LibreNmsClient } from "../src/librenms-client.ts";
import { WriteGateError } from "../src/gates.ts";
import { createLibrenmsAckAlertTool } from "../src/tools/librenms_ack_alert.ts";
import { createLibrenmsSetMaintenanceTool } from "../src/tools/librenms_set_maintenance.ts";
import { createLibrenmsUnmuteAlertTool } from "../src/tools/librenms_unmute_alert.ts";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
  details?: unknown;
};

type ToolLike = {
  name: string;
  parameters: object;
  execute: (id: string, args: Record<string, unknown>) => Promise<unknown>;
};

function fakeClient(): LibreNmsClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as unknown as LibreNmsClient;
}

function expectNoClientApiCalls(client: LibreNmsClient): void {
  for (const [name, maybeMock] of Object.entries(client as object)) {
    if (typeof maybeMock !== "function" || !("mock" in maybeMock)) continue;
    expect(maybeMock, `${name} should not be called`).not.toHaveBeenCalled();
  }
}

async function wrappedResult(
  tool: ToolLike,
  params: Record<string, unknown>,
): Promise<ToolResult> {
  return (await withRedactedErrors(tool).execute("golden-call", params)) as ToolResult;
}

describe("golden confirm-gated destructive tool contracts", () => {
  it.each([
    {
      name: "ack alert",
      build: createLibrenmsAckAlertTool,
      params: { id: 42, confirm: false },
      message:
        'librenms_ack_alert is a write operation. Pass {"confirm": true} to proceed.',
    },
    {
      name: "set maintenance",
      build: createLibrenmsSetMaintenanceTool,
      params: { hostname: "sw1.lan", duration: "2:00", confirm: false },
      message:
        'librenms_set_maintenance is a write operation. Pass {"confirm": true} to proceed.',
    },
    {
      name: "unmute alert",
      build: createLibrenmsUnmuteAlertTool,
      params: { id: 42, confirm: false },
      message:
        'librenms_unmute_alert is a write operation. Pass {"confirm": true} to proceed.',
    },
  ])("$name returns the current refusal envelope before any client call", async ({ build, params, message }) => {
    const client = fakeClient();
    const getClient = vi.fn(() => client);
    const tool = build(getClient);

    await expect(tool.execute("golden-call", params)).rejects.toThrow(WriteGateError);
    expect(getClient).not.toHaveBeenCalled();
    expectNoClientApiCalls(client);

    const result = await wrappedResult(tool, params);
    expect(result).toEqual({
      content: [{ type: "text", text: JSON.stringify({ error: message }) }],
      isError: true,
    });
    expect(result).not.toHaveProperty("details");
    expect(getClient).not.toHaveBeenCalled();
    expectNoClientApiCalls(client);
  });
});

describe("golden boundary error stringification contracts", () => {
  it.each([
    { name: "empty Error", thrown: new Error(""), message: "" },
    { name: "non-Error number", thrown: 42, message: "42" },
  ])("keeps pre-kit stringification for $name at MCP-shaped boundaries", ({ thrown, message }) => {
    const expected = {
      content: [{ type: "text", text: JSON.stringify({ error: message }) }],
      isError: true,
    };

    expect(pluginErrorResult(thrown)).toEqual(expected);
    expect(mcpErrorResult(thrown)).toEqual(expected);
  });
});
