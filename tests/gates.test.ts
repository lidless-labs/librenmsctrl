import { describe, it, expect } from "vitest";
import { assertConfirmedWrite, WriteGateError } from "../src/gates.ts";

describe("assertConfirmedWrite", () => {
  it("passes when confirm is true", () => {
    expect(() => assertConfirmedWrite({ confirm: true }, "librenms_ack_alert")).not.toThrow();
  });
  it("throws when confirm is missing", () => {
    expect(() => assertConfirmedWrite({}, "librenms_ack_alert")).toThrow(WriteGateError);
  });
  it("throws when confirm is false", () => {
    expect(() => assertConfirmedWrite({ confirm: false }, "librenms_ack_alert")).toThrow(WriteGateError);
  });
  it("error message names the tool", () => {
    try { assertConfirmedWrite({}, "librenms_ack_alert"); }
    catch (e) { expect((e as Error).message).toContain("librenms_ack_alert"); }
  });
});
