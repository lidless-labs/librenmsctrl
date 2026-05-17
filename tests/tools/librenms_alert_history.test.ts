import { describe, it, expect, afterEach } from "vitest";
import { startFakeLibreNms, type FakeLibreNms } from "../fake-librenms.ts";
import { LibreNmsClient } from "../../src/librenms-client.ts";
import { createLibrenmsAlertHistoryTool } from "../../src/tools/librenms_alert_history.ts";

let fake: FakeLibreNms | null = null;
afterEach(async () => {
  if (fake) await fake.close();
  fake = null;
});

describe("librenms_alert_history", () => {
  it("returns logs with the default limit when no device_id given", async () => {
    fake = await startFakeLibreNms([
      {
        method: "GET",
        path: "/api/v0/logs/alertlog?limit=25",
        status: 200,
        body: {
          status: "ok",
          logs: [
            { id: 1, device_id: 1, time_logged: "2026-05-17 12:00:00" },
            { id: 2, device_id: 1, time_logged: "2026-05-17 12:05:00" },
          ],
        },
      },
    ]);
    const tool = createLibrenmsAlertHistoryTool(
      () =>
        new LibreNmsClient({
          url: fake!.baseUrl,
          token: "t",
          tlsInsecure: false,
        }),
    );
    const r = await tool.execute("test-id", {});
    const payload = JSON.parse(r.content[0].text);
    expect(payload.count).toBe(2);
    expect(payload.logs).toHaveLength(2);
    expect(fake!.requests[0].path).toBe("/api/v0/logs/alertlog?limit=25");
  });

  it("scopes by device_id and honors a custom limit", async () => {
    fake = await startFakeLibreNms([
      {
        method: "GET",
        path: "/api/v0/logs/alertlog/7?limit=5",
        status: 200,
        body: { status: "ok", logs: [{ id: 9, device_id: 7 }] },
      },
    ]);
    const tool = createLibrenmsAlertHistoryTool(
      () =>
        new LibreNmsClient({
          url: fake!.baseUrl,
          token: "t",
          tlsInsecure: false,
        }),
    );
    const r = await tool.execute("test-id", { device_id: 7, limit: 5 });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.count).toBe(1);
    expect(payload.logs[0].device_id).toBe(7);
    expect(fake!.requests[0].path).toBe("/api/v0/logs/alertlog/7?limit=5");
  });
});
