import { ok } from "@lidless-labs/effect-operator-kit";
import type { LibreNmsClient } from "../librenms-client.ts";

export type ClientFactory = () => LibreNmsClient;

/**
 * Success tool result. Delegates serialization to kit `ok`.
 *
 * Semantic wrap: kit always attaches `details`; LibreNMS golden contracts
 * require content-only success (no `details`, no `isError`). Content text is
 * identical (pretty JSON via JSON.stringify(..., null, 2)).
 */
export function jsonToolResult(payload: unknown) {
  const r = ok(payload);
  return { content: r.content };
}

/**
 * Error tool result matching repo contracts used by MCP boundaries / golden-write.
 */
export function toolFail(message: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: message }),
      },
    ],
    isError: true as const,
  };
}

/**
 * Write-gate refusal as an MCP error envelope.
 */
export function toolRefuseUnconfirmed(toolName: string) {
  const message = `${toolName} is a write operation. Pass {"confirm": true} to proceed.`;
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: message }),
      },
    ],
    isError: true as const,
  };
}

/**
 * Defense-in-depth coercion for numeric id/limit params that get interpolated
 * into URL paths or query strings. Runtime schema validation already enforces
 * these, but coercing here guarantees only a safe positive integer (optionally
 * bounded) ever reaches a request, even if a caller bypasses the dispatcher.
 */
export function safeInt(
  value: unknown,
  label: string,
  opts: { min?: number; max?: number } = {},
): number {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;
  if (!Number.isInteger(n)) {
    throw new Error(`${label} must be an integer, got: ${String(value)}`);
  }
  const min = opts.min ?? 1;
  if (n < min) throw new Error(`${label} must be >= ${min}, got: ${n}`);
  if (opts.max !== undefined && n > opts.max) {
    throw new Error(`${label} must be <= ${opts.max}, got: ${n}`);
  }
  return n;
}
