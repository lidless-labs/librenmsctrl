import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { jsonToolResult } from "./_util.ts";

const Schema = Type.Object(
  {
    state: Type.Optional(
      Type.Union(
        [Type.Literal(0), Type.Literal(1), Type.Literal(2)],
        { description: "Alert state filter: 0=ok, 1=active, 2=ack." },
      ),
    ),
  },
  { additionalProperties: false },
);

export function createLibrenmsListAlertsTool(getClient: ClientFactory) {
  return {
    name: "librenms_list_alerts",
    label: "librenms: list alerts",
    description:
      "List alerts via GET /api/v0/alerts. Optional state filter (0=ok, 1=active, 2=ack).",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const args = (raw ?? {}) as { state?: 0 | 1 | 2 };
      const path =
        args.state !== undefined ? `/alerts?state=${args.state}` : "/alerts";
      const client = getClient();
      const r = await client.get<{
        status: string;
        alerts: Array<Record<string, unknown>>;
      }>(path);
      return jsonToolResult({ alerts: r.alerts ?? [] });
    },
  };
}
