import { describe, it, expect, afterEach } from "vitest";
import { startFakeLibreNms, type FakeLibreNms } from "../fake-librenms.ts";
import { LibreNmsClient } from "../../src/librenms-client.ts";
import { createLibrenmsAckAlertTool } from "../../src/tools/librenms_ack_alert.ts";
import { WriteGateError } from "../../src/gates.ts";

let fake: FakeLibreNms | null = null;
afterEach(async () => {
  if (fake) await fake.close();
  fake = null;
});

function makeTool() {
  return createLibrenmsAckAlertTool(
    () =>
      new LibreNmsClient({
        url: fake!.baseUrl,
        token: "t",
        tlsInsecure: false,
      }),
  );
}

describe("librenms_ack_alert", () => {
  it("refuses without confirm:true", async () => {
    fake = await startFakeLibreNms([]);
    const tool = makeTool();
    await expect(tool.execute("test", { id: 42 })).rejects.toThrow(
      WriteGateError,
    );
  });

  it("PUTs to /alerts/{id} with empty body when no optional args", async () => {
    fake = await startFakeLibreNms([
      {
        method: "PUT",
        path: "/api/v0/alerts/42",
        status: 200,
        body: { status: "ok", message: "acked" },
      },
    ]);
    const tool = makeTool();
    const r = await tool.execute("test", { id: 42, confirm: true });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.alert_id).toBe(42);
    expect(payload.acked).toBe(true);
    const putReq = fake.requests.find((q) => q.method === "PUT");
    expect(putReq?.path).toBe("/api/v0/alerts/42");
    const body = JSON.parse(putReq!.body);
    expect(body).toEqual({});
    expect(body.state).toBeUndefined();
  });

  it("PUTs to /alerts/{id} with note + until_clear when provided", async () => {
    fake = await startFakeLibreNms([
      {
        method: "PUT",
        path: "/api/v0/alerts/42",
        status: 200,
        body: { status: "ok", message: "acked" },
      },
    ]);
    const tool = makeTool();
    const r = await tool.execute("test", {
      id: 42,
      note: "looking into it",
      until_clear: true,
      confirm: true,
    });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.alert_id).toBe(42);
    expect(payload.acked).toBe(true);
    const putReq = fake.requests.find((q) => q.method === "PUT");
    expect(putReq?.path).toBe("/api/v0/alerts/42");
    const body = JSON.parse(putReq!.body);
    expect(body.note).toBe("looking into it");
    expect(body.until_clear).toBe(true);
    expect(body.state).toBeUndefined();
  });
});
