import { describe, it, expect, afterEach } from "vitest";
import { startFakeLibreNms, type FakeLibreNms } from "./fake-librenms.ts";
import { LibreNmsClient } from "../src/librenms-client.ts";
import * as toolFactories from "../src/tools/index.ts";

let fake: FakeLibreNms | null = null;
afterEach(async () => {
  if (fake) await fake.close();
  fake = null;
});

describe("integration", () => {
  it("all 10 tools register with unique names matching ^librenms_", () => {
    const dummy = () =>
      new LibreNmsClient({ url: "http://x", token: "t", tlsInsecure: false });
    const created = [
      toolFactories.createLibrenmsStatusTool(dummy),
      toolFactories.createLibrenmsListDevicesTool(dummy),
      toolFactories.createLibrenmsGetDeviceTool(dummy),
      toolFactories.createLibrenmsListPortsTool(dummy),
      toolFactories.createLibrenmsPortHealthTool(dummy),
      toolFactories.createLibrenmsListAlertsTool(dummy),
      toolFactories.createLibrenmsGetAlertTool(dummy),
      toolFactories.createLibrenmsAlertHistoryTool(dummy),
      toolFactories.createLibrenmsAckAlertTool(dummy),
      toolFactories.createLibrenmsSetMaintenanceTool(dummy),
    ];
    expect(created).toHaveLength(10);
    const names = created.map((t) => t.name);
    expect(new Set(names).size).toBe(10);
    for (const n of names) expect(n).toMatch(/^librenms_/);
  });

  it("end-to-end: status read + ack_alert write via the fake server", async () => {
    fake = await startFakeLibreNms([
      {
        method: "GET",
        path: "/api/v0/system",
        status: 200,
        body: {
          status: "ok",
          system: [
            {
              version: "23.11.0",
              database_ver: "2024_01_01",
              local_disk: "/opt/librenms",
            },
          ],
        },
      },
      {
        method: "PUT",
        path: "/api/v0/alerts/42",
        status: 200,
        body: { status: "ok", message: "acked" },
      },
    ]);
    const mkClient = () =>
      new LibreNmsClient({
        url: fake!.baseUrl,
        token: "t",
        tlsInsecure: false,
      });
    const status = toolFactories.createLibrenmsStatusTool(mkClient);
    const ack = toolFactories.createLibrenmsAckAlertTool(mkClient);

    const sr = await status.execute();
    const sp = JSON.parse(sr.content[0].text);
    expect(sp.system).not.toBeNull();
    expect(sp.system.version).toBe("23.11.0");

    const ar = await ack.execute("id", {
      id: 42,
      note: "looking into it",
      confirm: true,
    });
    const payload = JSON.parse(ar.content[0].text);
    expect(payload.alert_id).toBe(42);
    expect(payload.acked).toBe(true);

    const ackReq = fake.requests.find(
      (r) => r.method === "PUT" && r.path === "/api/v0/alerts/42",
    );
    expect(ackReq).toBeDefined();
    const body = JSON.parse(ackReq!.body);
    expect(body.note).toBe("looking into it");
    expect(body.state).toBeUndefined();
  });
});
