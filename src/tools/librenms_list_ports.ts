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

const COLUMNS =
  "ifName,ifAdminStatus,ifOperStatus,ifInErrors,ifOutErrors,ifSpeed,ifDescr";

export function createLibrenmsListPortsTool(getClient: ClientFactory) {
  return {
    name: "librenms_list_ports",
    label: "librenms: list ports",
    description:
      "List ports on a device via GET /api/v0/devices/{hostname}/ports with a fixed column set (name, status, errors, speed, descr).",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const args = raw as { hostname: string };
      const client = getClient();
      const r = await client.get<{
        status: string;
        ports: Array<Record<string, unknown>>;
      }>(`/devices/${encodeURIComponent(args.hostname)}/ports?columns=${COLUMNS}`);
      return jsonToolResult({ ports: r.ports ?? [] });
    },
  };
}
