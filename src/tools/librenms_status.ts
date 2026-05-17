import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { jsonToolResult } from "./_util.ts";

const Schema = Type.Object({}, { additionalProperties: false });

export function createLibrenmsStatusTool(getClient: ClientFactory) {
  return {
    name: "librenms_status",
    label: "librenms: status",
    description:
      "LibreNMS system health (version, totals, last poll) via GET /api/v0/system.",
    parameters: Schema,
    execute: async () => {
      const client = getClient();
      const r = await client.get<{
        status: string;
        system: Array<Record<string, unknown>>;
      }>("/system");
      return jsonToolResult({ system: r.system?.[0] ?? null });
    },
  };
}
