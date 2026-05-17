import { Type } from "@sinclair/typebox";
import type { ClientFactory } from "./_util.ts";
import { jsonToolResult } from "./_util.ts";

const Schema = Type.Object(
  {
    limit: Type.Optional(
      Type.Integer({
        minimum: 1,
        description: "Number of top ports to return. Default 10.",
      }),
    ),
    metric: Type.Optional(
      Type.Union(
        [
          Type.Literal("errors_in"),
          Type.Literal("errors_out"),
          Type.Literal("utilization"),
        ],
        { description: "Ranking metric. Default 'errors_in'." },
      ),
    ),
  },
  { additionalProperties: false },
);

const COLUMNS =
  "device_id,ifName,ifInErrors,ifOutErrors,ifSpeed,ifInOctets,ifOutOctets";

export function createLibrenmsPortHealthTool(getClient: ClientFactory) {
  return {
    name: "librenms_port_health",
    label: "librenms: port health",
    description:
      "Rank ports by errors_in (default), errors_out, or utilization via GET /api/v0/ports with client-side sort.",
    parameters: Schema,
    execute: async (_id: string, raw: Record<string, unknown>) => {
      const args = (raw ?? {}) as {
        limit?: number;
        metric?: "errors_in" | "errors_out" | "utilization";
      };
      const limit = args.limit ?? 10;
      const metric = args.metric ?? "errors_in";
      const client = getClient();
      const r = await client.get<{
        status: string;
        ports: Array<Record<string, unknown>>;
      }>(`/ports?columns=${COLUMNS}`);
      const ports = (r.ports ?? []) as Array<{
        device_id: number;
        ifName: string;
        ifInErrors?: number;
        ifOutErrors?: number;
        ifSpeed?: number;
        ifInOctets?: number;
        ifOutOctets?: number;
      }>;
      const sorted = ports.slice().sort((a, b) => {
        if (metric === "errors_in") {
          return (b.ifInErrors ?? 0) - (a.ifInErrors ?? 0);
        }
        if (metric === "errors_out") {
          return (b.ifOutErrors ?? 0) - (a.ifOutErrors ?? 0);
        }
        const aUtil = a.ifSpeed
          ? ((a.ifInOctets ?? 0) + (a.ifOutOctets ?? 0)) / a.ifSpeed
          : 0;
        const bUtil = b.ifSpeed
          ? ((b.ifInOctets ?? 0) + (b.ifOutOctets ?? 0)) / b.ifSpeed
          : 0;
        return bUtil - aUtil;
      });
      return jsonToolResult({ metric, limit, top: sorted.slice(0, limit) });
    },
  };
}
