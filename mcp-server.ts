import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { resolveConfig, type LibreNmsConfig } from "./src/config.ts";
import { boundaryErrorMessage } from "./src/error-message.ts";
import { LibreNmsClient } from "./src/librenms-client.ts";
import { registerSecret, redact } from "./src/security.ts";
import { validateToolArgs } from "./src/validate.ts";
import * as toolFactories from "./src/tools/index.ts";

export function createServer(): Server {
  const cfg: LibreNmsConfig = resolveConfig(process.env);
  registerSecret(cfg.token);

  const getClient = () => new LibreNmsClient(cfg);

  const tools = [
    toolFactories.createLibrenmsStatusTool(getClient),
    toolFactories.createLibrenmsListDevicesTool(getClient),
    toolFactories.createLibrenmsGetDeviceTool(getClient),
    toolFactories.createLibrenmsListPortsTool(getClient),
    toolFactories.createLibrenmsPortHealthTool(getClient),
    toolFactories.createLibrenmsListAlertsTool(getClient),
    toolFactories.createLibrenmsGetAlertTool(getClient),
    toolFactories.createLibrenmsAlertHistoryTool(getClient),
    toolFactories.createLibrenmsAckAlertTool(getClient),
    toolFactories.createLibrenmsSetMaintenanceTool(getClient),
    toolFactories.createLibrenmsGetPortTool(getClient),
    toolFactories.createLibrenmsEventLogTool(getClient),
    toolFactories.createLibrenmsUnmuteAlertTool(getClient),
  ];

  const toolMap = new Map(tools.map((t) => [t.name, t]));

  const server = new Server({ name: "librenms-mcp", version: "0.2.0" }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.parameters })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const t = toolMap.get(req.params.name);
    if (!t) {
      return { content: [{ type: "text", text: JSON.stringify({ error: `unknown tool: ${req.params.name}` }) }], isError: true };
    }
    try {
      const args = (req.params.arguments ?? {}) as Record<string, unknown>;
      validateToolArgs(t.parameters, t.name, args);
      return await t.execute(req.params.name, args);
    } catch (e) {
      return mcpErrorResult(e);
    }
  });

  return server;
}

export function mcpErrorResult(error: unknown) {
  const msg = redact(boundaryErrorMessage(error)) as string;
  return { content: [{ type: "text" as const, text: JSON.stringify({ error: msg }) }], isError: true as const };
}

export async function serve(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  // Strip the draft-07 `$schema` the MCP SDK stamps on tool schemas; Anthropic
  // rejects it ("must match JSON Schema draft 2020-12") when the full tool set
  // is sent, e.g. on subagent spawns. Intercept tools/list output here.
  const __send = transport.send.bind(transport);
  (transport as any).send = (message: any) => {
    const tools = message?.result?.tools;
    if (Array.isArray(tools)) {
      for (const t of tools) {
        if (t?.inputSchema) delete t.inputSchema.$schema;
        if (t?.outputSchema) delete t.outputSchema.$schema;
      }
    }
    return __send(message);
  };
  await server.connect(transport);
}
