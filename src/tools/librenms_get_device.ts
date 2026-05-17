import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { jsonToolResult } from "./_util.ts";

const Schema = Type.Object(
  {
    hostname: Type.String({
      description: "Device hostname or IP as configured in LibreNMS.",
    }),
  },
  { additionalProperties: false },
);

export function createLibrenmsGetDeviceTool(getClient: ClientFactory) {
  return {
    name: "librenms_get_device",
    label: "librenms: get device",
    description:
      "Fetch a single device by hostname via GET /api/v0/devices/{hostname}.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const args = raw as { hostname: string };
      const client = getClient();
      const r = await client.get<{
        status: string;
        devices: Array<Record<string, unknown>>;
      }>(`/devices/${encodeURIComponent(args.hostname)}`);
      return jsonToolResult({ device: r.devices?.[0] ?? null });
    },
  };
}
