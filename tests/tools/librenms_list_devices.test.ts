import { describe, it, expect, afterEach } from "vitest";
import { startFakeLibreNms, type FakeLibreNms } from "../fake-librenms.ts";
import { LibreNmsClient } from "../../src/librenms-client.ts";
import { createLibrenmsListDevicesTool } from "../../src/tools/librenms_list_devices.ts";

let fake: FakeLibreNms | null = null;
afterEach(async () => {
  if (fake) await fake.close();
  fake = null;
});

describe("librenms_list_devices", () => {
  it("returns devices for the default (no-type) call", async () => {
    fake = await startFakeLibreNms([
      {
        method: "GET",
        path: "/api/v0/devices",
        status: 200,
        body: {
          status: "ok",
          devices: [
            { device_id: 1, hostname: "router-1", status: 1 },
            { device_id: 2, hostname: "switch-1", status: 1 },
          ],
        },
      },
    ]);
    const tool = createLibrenmsListDevicesTool(
      () =>
        new LibreNmsClient({
          url: fake!.baseUrl,
          token: "t",
          tlsInsecure: false,
        }),
    );
    const r = await tool.execute("test-id", {});
    const payload = JSON.parse(r.content[0].text);
    expect(payload.devices).toHaveLength(2);
    expect(payload.devices[0].hostname).toBe("router-1");
  });

  it("passes type filter into the query string", async () => {
    fake = await startFakeLibreNms([
      {
        method: "GET",
        path: "/api/v0/devices?type=down",
        status: 200,
        body: { status: "ok", devices: [{ device_id: 3, hostname: "down-1" }] },
      },
    ]);
    const tool = createLibrenmsListDevicesTool(
      () =>
        new LibreNmsClient({
          url: fake!.baseUrl,
          token: "t",
          tlsInsecure: false,
        }),
    );
    const r = await tool.execute("test-id", { type: "down" });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.devices[0].hostname).toBe("down-1");
    expect(fake!.requests[0].path).toBe("/api/v0/devices?type=down");
  });
});
