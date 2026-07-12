// NOTE: openclaw/plugin-sdk/plugin-entry's AnyAgentTool expects
// AgentToolResult<unknown> (with a `details` field), but our tool factories
// return MCP-shaped { content: [{ type: "text", text }] } results so the same
// tool objects can be served over the MCP stdio transport in mcp-server.ts.
// The runtime registration is duck-typed and works fine; we cast through
// `unknown` to bridge the intentional structural mismatch.
import { definePluginEntry, type AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import type { TSchema } from "@sinclair/typebox";
import { operatorErrorMessage } from "@lidless-labs/effect-operator-kit";
import { resolveConfig, type LibreNmsConfig } from "./src/config.ts";
import { LibreNmsClient } from "./src/librenms-client.ts";
import { registerSecret, redact } from "./src/security.ts";
import { validateToolArgs } from "./src/validate.ts";
import * as tools from "./src/tools/index.ts";

interface ToolLike {
  name: string;
  execute: (id: string, args: Record<string, unknown>) => Promise<unknown>;
  [key: string]: unknown;
}

export function withRedactedErrors<T extends ToolLike>(tool: T): T {
  const orig = tool.execute.bind(tool);
  return {
    ...tool,
    execute: async (id: string, args: Record<string, unknown>) => {
      try {
        validateToolArgs(tool.parameters as TSchema, tool.name, args ?? {});
        return await orig(id, args);
      } catch (e) {
        // Kit mcp adapter message extraction with repo-owned redact (not kit defaultRedact).
        const msg = redact(operatorErrorMessage(e)) as string;
        return { content: [{ type: "text", text: JSON.stringify({ error: msg }) }], isError: true };
      }
    },
  };
}

function makeFactory(cfg: LibreNmsConfig) {
  registerSecret(cfg.token);
  return () => new LibreNmsClient(cfg);
}

export default definePluginEntry({
  id: "librenms",
  name: "LibreNMS",
  description:
    "LibreNMS read + safe-write tools: system status, devices, ports, alerts, ack, maintenance. Single-instance, X-Auth-Token, optional TLS-insecure. Tier-2 writes gated by confirm:true.",
  register(api) {
    if (api.registrationMode !== "full") return;
    const cfg = resolveConfig(process.env);
    const getClient = makeFactory(cfg);
    const register = (t: ToolLike) =>
      api.registerTool(withRedactedErrors(t) as unknown as AnyAgentTool);
    register(tools.createLibrenmsStatusTool(getClient));
    register(tools.createLibrenmsListDevicesTool(getClient));
    register(tools.createLibrenmsGetDeviceTool(getClient));
    register(tools.createLibrenmsListPortsTool(getClient));
    register(tools.createLibrenmsPortHealthTool(getClient));
    register(tools.createLibrenmsListAlertsTool(getClient));
    register(tools.createLibrenmsGetAlertTool(getClient));
    register(tools.createLibrenmsAlertHistoryTool(getClient));
    register(tools.createLibrenmsAckAlertTool(getClient));
    register(tools.createLibrenmsSetMaintenanceTool(getClient));
    register(tools.createLibrenmsGetPortTool(getClient));
    register(tools.createLibrenmsEventLogTool(getClient));
    register(tools.createLibrenmsUnmuteAlertTool(getClient));
  },
});
