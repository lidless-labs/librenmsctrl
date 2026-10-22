import { annotationsFromTiers, assertNoDrift, type ToolAnnotations, type ToolTier } from "@lidless-labs/effect-operator-kit";

/**
 * Tool tier registry. Executor v2 prompts only on `destructiveHint === true`, so
 * only the reads are declared read-only; the Tier-2 writes keep the kit's
 * fail-closed `destructiveHint: true`. A new tool must be added here or
 * `buildAllTools` throws at startup.
 */
export const TOOL_TIERS: Readonly<Record<string, ToolTier>> = {
  librenms_status: "read",
  librenms_list_devices: "read",
  librenms_get_device: "read",
  librenms_list_ports: "read",
  librenms_port_health: "read",
  librenms_list_alerts: "read",
  librenms_get_alert: "read",
  librenms_alert_history: "read",
  librenms_get_port: "read",
  librenms_event_log: "read",

  librenms_ack_alert: "destructive",
  librenms_set_maintenance: "destructive",
  librenms_unmute_alert: "destructive",
};

const ANNOTATIONS = annotationsFromTiers(TOOL_TIERS);

/** Attach each tool's declared annotations, failing when a tool and the registry disagree. */
export function withAnnotations<T extends { name: string }>(tools: T[]): Array<T & { annotations: ToolAnnotations }> {
  assertNoDrift(tools.map((t) => t.name), TOOL_TIERS);
  return tools.map((t) => ({ ...t, annotations: ANNOTATIONS[t.name]! }));
}
