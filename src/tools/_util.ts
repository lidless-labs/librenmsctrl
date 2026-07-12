import { fail, ok, refuseUnconfirmed } from "@lidless-labs/effect-operator-kit";
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
 * Error tool result. Delegates to kit `fail` for the error path, then rebuilds
 * the envelope to match repo contracts used by MCP boundaries / golden-write.
 *
 * Semantic wraps vs kit `fail`:
 * - kit pretty-prints content (`null, 2`); repo uses compact `JSON.stringify({ error })`
 * - kit may set `details`; repo errors omit `details`
 * - single layer only: plain message → one `{ error: message }` blob + `isError`
 */
export function toolFail(message: string) {
  // Call kit fail for the shared error path; rebuild compact content without details.
  const r = fail(message);
  if (!r.isError) {
    // kit always sets isError; guard keeps the wrap honest if kit changes
    throw new Error("effect-operator-kit fail() returned non-error result");
  }
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
 *
 * Semantic wrap vs kit `refuseUnconfirmed`:
 * - kit message: `Refusing to ${operation} without explicit confirmation…`
 * - repo message: `${toolName} is a write operation. Pass {"confirm": true} to proceed.`
 * - kit uses pretty-printed fail content; repo uses compact JSON
 *
 * Note: call sites currently throw `WriteGateError` and let the boundary map
 * to this shape; this helper is for boundary/D reuse without changing that flow.
 */
export function toolRefuseUnconfirmed(toolName: string) {
  // Exercise kit primitive (isError path); discard incompatible message/formatting.
  const kit = refuseUnconfirmed(toolName);
  const message = `${toolName} is a write operation. Pass {"confirm": true} to proceed.`;
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ error: message }),
      },
    ],
    isError: (kit.isError ?? true) as true,
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
