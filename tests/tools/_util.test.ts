import { describe, it, expect } from "vitest";
import { safeInt, toolFail, toolRefuseUnconfirmed } from "../../src/tools/_util.ts";

describe("safeInt", () => {
  it("returns a valid positive integer unchanged", () => {
    expect(safeInt(42, "id")).toBe(42);
  });

  it("coerces a numeric string", () => {
    expect(safeInt("42", "id")).toBe(42);
  });

  it("rejects an injection-style string", () => {
    expect(() => safeInt("1/../system", "id")).toThrow(/integer/);
  });

  it("rejects a float", () => {
    expect(() => safeInt(1.5, "id")).toThrow(/integer/);
  });

  it("enforces the default minimum of 1", () => {
    expect(() => safeInt(0, "id")).toThrow(/>= 1/);
  });

  it("enforces an explicit max", () => {
    expect(() => safeInt(101, "limit", { max: 100 })).toThrow(/<= 100/);
  });

  it("rejects NaN and non-numeric input", () => {
    expect(() => safeInt("abc", "id")).toThrow(/integer/);
    expect(() => safeInt(undefined, "id")).toThrow(/integer/);
  });
});

describe("tool result helpers", () => {
  it("builds the repo-owned compact error envelope", () => {
    expect(toolFail("bad input")).toEqual({
      content: [{ type: "text", text: JSON.stringify({ error: "bad input" }) }],
      isError: true,
    });
  });

  it("builds the repo-owned compact write-refusal envelope", () => {
    expect(toolRefuseUnconfirmed("librenms_ack_alert")).toEqual({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: 'librenms_ack_alert is a write operation. Pass {"confirm": true} to proceed.',
          }),
        },
      ],
      isError: true,
    });
  });
});
