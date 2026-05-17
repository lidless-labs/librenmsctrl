import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { jsonToolResult } from "./_util.ts";

const Schema = Type.Object(
  {
    type: Type.Optional(
      Type.Union(
        [
          Type.Literal("all"),
          Type.Literal("up"),
          Type.Literal("down"),
          Type.Literal("ignored"),
          Type.Literal("disabled"),
        ],
        { description: "Device filter type. Default 'all'." },
      ),
    ),
  },
  { additionalProperties: false },
);

export function createLibrenmsListDevicesTool(getClient: ClientFactory) {
  return {
    name: "librenms_list_devices",
    label: "librenms: list devices",
    description:
      "List devices monitored by LibreNMS via GET /api/v0/devices. Optional type filter (all|up|down|ignored|disabled).",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const args = (raw ?? {}) as {
        type?: "all" | "up" | "down" | "ignored" | "disabled";
      };
      const path = args.type ? `/devices?type=${args.type}` : "/devices";
      const client = getClient();
      const r = await client.get<{
        status: string;
        devices: Array<Record<string, unknown>>;
      }>(path);
      return jsonToolResult({ devices: r.devices ?? [] });
    },
  };
}
