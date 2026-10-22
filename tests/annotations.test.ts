import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { assertToolAnnotations, type ToolAnnotations } from "@lidless-labs/effect-operator-kit";
import { createServer } from "../mcp-server.ts";
import { LibreNmsClient } from "../src/librenms-client.ts";
import { TOOL_TIERS } from "../src/tools/annotations.ts";
import { buildAllTools } from "../src/tools/index.ts";
import { jsonToolResult, toolFail } from "../src/tools/_util.ts";
import { startFakeLibreNms, type FakeLibreNms } from "./fake-librenms.ts";

const dummy = () => new LibreNmsClient({ url: "http://x", token: "t", tlsInsecure: false });

let fake: FakeLibreNms | null = null;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (fake) await fake.close();
  fake = null;
});

async function connect(baseUrl: string) {
  vi.stubEnv("LIBRENMS_URL", baseUrl);
  vi.stubEnv("LIBRENMS_TOKEN", "t");
  const server = createServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "annotations-test", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

describe("tool annotations", () => {
  const tools = buildAllTools(dummy);

  it("declares explicit hints on every tool and passes the kit audit", () => {
    assertToolAnnotations(new Map<string, ToolAnnotations | undefined>(tools.map((t) => [t.name, t.annotations])));
  });

  it("marks the 10 reads read-only and the 3 writes destructive", () => {
    for (const tool of tools) {
      const isRead = TOOL_TIERS[tool.name] === "read";
      expect(tool.annotations.readOnlyHint, tool.name).toBe(isRead);
      expect(tool.annotations.destructiveHint, tool.name).toBe(!isRead);
    }
    expect(tools.filter((t) => t.annotations.readOnlyHint)).toHaveLength(10);
  });

  it("serves the annotations over tools/list", async () => {
    fake = await startFakeLibreNms();
    const { client, close } = await connect(fake.baseUrl);
    try {
      const listed = (await client.listTools()).tools;
      expect(listed).toHaveLength(13);
      expect(listed.find((t) => t.name === "librenms_status")?.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(listed.find((t) => t.name === "librenms_ack_alert")?.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: true });
    } finally {
      await close();
    }
  });
});

describe("byte cap", () => {
  it("returns a small payload unchanged and content-only", () => {
    expect(jsonToolResult({ a: 1 })).toEqual({ content: [{ type: "text", text: JSON.stringify({ a: 1 }, null, 2) }] });
  });

  it("truncates an oversize success payload with the kit marker and a structured flag", () => {
    const result = jsonToolResult({ rows: "é".repeat(80_000) });
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(90_000);
    expect(result.content[0]!.text).toContain("[truncated: output was");
    expect(result.structuredContent).toMatchObject({ truncated: true, maxBytes: 90_000 });
    expect(result).not.toHaveProperty("details");
  });

  it("truncates an oversize error result and keeps isError", () => {
    const result = toolFail("x".repeat(200_000));
    expect(result.isError).toBe(true);
    expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(90_000);
    expect(result.content[0]!.text).toContain("[truncated: output was");
  });

  it("truncates an oversize upstream error end to end", async () => {
    fake = await startFakeLibreNms([
      { method: "GET", path: "/api/v0/system", status: 400, body: { message: "x".repeat(200_000) } },
    ]);
    const { client, close } = await connect(fake.baseUrl);
    try {
      const result = await client.callTool({ name: "librenms_status", arguments: {} });
      expect(result.isError).toBe(true);
      expect(Buffer.byteLength(JSON.stringify(result), "utf8")).toBeLessThanOrEqual(90_000);
    } finally {
      await close();
    }
  });
});
