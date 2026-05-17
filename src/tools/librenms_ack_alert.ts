import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { jsonToolResult } from "./_util.ts";
import { assertConfirmedWrite } from "../gates.ts";

const Schema = Type.Object(
  {
    id: Type.Integer({ minimum: 1, description: "Alert id to acknowledge." }),
    note: Type.Optional(
      Type.String({ description: "Optional acknowledgement note." }),
    ),
    until_clear: Type.Optional(
      Type.Boolean({
        description:
          "When true, the ack persists until the alert clears (default LibreNMS behavior: ack until next state change).",
      }),
    ),
    confirm: Type.Boolean({
      description: "Must be true to write. Tier-2 safe-write gate.",
    }),
  },
  { additionalProperties: false },
);

const NAME = "librenms_ack_alert";

export function createLibrenmsAckAlertTool(getClient: ClientFactory) {
  return {
    name: NAME,
    label: "librenms: ack alert",
    description:
      "Acknowledge an active alert by id via PUT /api/v0/alerts/{id}. Tier-2 write; requires confirm:true.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      assertConfirmedWrite(raw, NAME);
      const args = raw as { id: number; note?: string; until_clear?: boolean };
      const client = getClient();
      const body: Record<string, unknown> = {};
      if (args.note !== undefined) body.note = args.note;
      if (args.until_clear !== undefined) body.until_clear = args.until_clear;
      const r = await client.put(`/alerts/${args.id}`, body);
      return jsonToolResult({ alert_id: args.id, acked: true, response: r });
    },
  };
}
