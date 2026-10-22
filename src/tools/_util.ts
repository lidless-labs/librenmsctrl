import { boundResult } from "@lidless-labs/effect-operator-kit";
import type { LibreNmsClient } from "../librenms-client.ts";

export type ClientFactory = () => LibreNmsClient;

// A type alias, not an interface, so it stays assignable to the MCP SDK's open result type.
export type ToolResultShape = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

/**
 * Apply the kit's UTF-8 byte cap to a hand-built result. An oversize result is cut
 * with the kit's `[truncated: ...]` marker and gains `structuredContent:
 * { truncated: true, ... }`; `isError` is kept.
 */
export function boundToolResult<T extends ToolResultShape>(result: T): T {
  return boundResult<ToolResultShape>(result) as T;
}

/**
 * Success tool result. Keeps the historical content-only shape (2-space JSON, no
 * `details`, no `isError`, no `structuredContent`) that LibreNMS golden contracts
 * require, under the kit's byte cap.
 */
export function jsonToolResult(payload: unknown): ToolResultShape {
  return boundToolResult({
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) ?? "null" }],
  });
}

/**
 * Error tool result matching repo contracts used by MCP boundaries / golden-write.
 */
export function toolFail(message: string) {
  return boundToolResult({
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: message }),
      },
    ],
    isError: true as const,
  });
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
