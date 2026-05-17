import type { LibreNmsClient } from "../librenms-client.ts";

export type ClientFactory = () => LibreNmsClient;

export function jsonToolResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}
