import { describe, it, expect, afterEach } from "vitest";
import { startFakeLibreNms, type FakeLibreNms } from "../fake-librenms.ts";
import { LibreNmsClient } from "../../src/librenms-client.ts";
import { createLibrenmsListAlertsTool } from "../../src/tools/librenms_list_alerts.ts";

let fake: FakeLibreNms | null = null;
afterEach(async () => {
  if (fake) await fake.close();
  fake = null;
});

describe("librenms_list_alerts", () => {
  it("returns alerts without a state filter", async () => {
    fake = await startFakeLibreNms([
      {
        method: "GET",
        path: "/api/v0/alerts",
        status: 200,
        body: {
          status: "ok",
          alerts: [
            { id: 1, device_id: 1, state: 1 },
            { id: 2, device_id: 2, state: 0 },
          ],
        },
      },
    ]);
    const tool = createLibrenmsListAlertsTool(
      () =>
        new LibreNmsClient({
          url: fake!.baseUrl,
          token: "t",
          tlsInsecure: false,
        }),
    );
    const r = await tool.execute("test-id", {});
    const payload = JSON.parse(r.content[0].text);
    expect(payload.alerts).toHaveLength(2);
  });

  it("passes state filter into query string", async () => {
    fake = await startFakeLibreNms([
      {
        method: "GET",
        path: "/api/v0/alerts?state=1",
        status: 200,
        body: { status: "ok", alerts: [{ id: 1, state: 1 }] },
      },
    ]);
    const tool = createLibrenmsListAlertsTool(
      () =>
        new LibreNmsClient({
          url: fake!.baseUrl,
          token: "t",
          tlsInsecure: false,
        }),
    );
    const r = await tool.execute("test-id", { state: 1 });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.alerts[0].state).toBe(1);
    expect(fake!.requests[0].path).toBe("/api/v0/alerts?state=1");
  });
});
