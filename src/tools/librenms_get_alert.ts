import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { jsonToolResult } from "./_util.ts";

const Schema = Type.Object(
  {
    id: Type.Integer({ minimum: 1, description: "Alert id." }),
  },
  { additionalProperties: false },
);

export function createLibrenmsGetAlertTool(getClient: ClientFactory) {
  return {
    name: "librenms_get_alert",
    label: "librenms: get alert",
    description: "Fetch a single alert by id via GET /api/v0/alerts/{id}.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const args = raw as { id: number };
      const client = getClient();
      const r = await client.get<{
        status: string;
        alerts: Array<Record<string, unknown>>;
      }>(`/alerts/${args.id}`);
      return jsonToolResult({ alert: r.alerts?.[0] ?? null });
    },
  };
}
