// NOTE: openclaw/plugin-sdk/plugin-entry's AnyAgentTool expects
// AgentToolResult<unknown> (with a `details` field), but our tool factories
// return MCP-shaped { content: [{ type: "text", text }] } results so the same
// tool objects can be served over the MCP stdio transport in mcp-server.ts.
// The runtime registration is duck-typed and works fine; we cast through
// `unknown` to bridge the intentional structural mismatch.
import { definePluginEntry, type AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import type { TSchema } from "@sinclair/typebox";
import { resolveConfig, type LibreNmsConfig } from "./src/config.ts";
import { boundaryErrorMessage } from "./src/error-message.ts";
import { LibreNmsClient } from "./src/librenms-client.ts";
import { registerSecret, redact } from "./src/security.ts";
import { validateToolArgs } from "./src/validate.ts";
import * as tools from "./src/tools/index.ts";
import { toolFail } from "./src/tools/_util.ts";

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
        return pluginErrorResult(e);
      }
    },
  };
}

export function pluginErrorResult(error: unknown) {
  const msg = redact(boundaryErrorMessage(error)) as string;
  return toolFail(msg);
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
    for (const t of tools.buildAllTools(getClient)) register(t as unknown as ToolLike);
  },
});
