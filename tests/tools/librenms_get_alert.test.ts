import { describe, it, expect, afterEach } from "vitest";
import { startFakeLibreNms, type FakeLibreNms } from "../fake-librenms.ts";
import { LibreNmsClient } from "../../src/librenms-client.ts";
import { createLibrenmsGetAlertTool } from "../../src/tools/librenms_get_alert.ts";

let fake: FakeLibreNms | null = null;
afterEach(async () => {
  if (fake) await fake.close();
  fake = null;
});

describe("librenms_get_alert", () => {
  it("returns the first alert entry for the id", async () => {
    fake = await startFakeLibreNms([
      {
        method: "GET",
        path: "/api/v0/alerts/42",
        status: 200,
        body: {
          status: "ok",
          alerts: [{ id: 42, device_id: 1, state: 1, severity: "warning" }],
        },
      },
    ]);
    const tool = createLibrenmsGetAlertTool(
      () =>
        new LibreNmsClient({
          url: fake!.baseUrl,
          token: "t",
          tlsInsecure: false,
        }),
    );
    const r = await tool.execute("test-id", { id: 42 });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.alert).toEqual({
      id: 42,
      device_id: 1,
      state: 1,
      severity: "warning",
    });
  });
});
