import { describe, it, expect, afterEach } from "vitest";
import { startFakeLibreNms, type FakeLibreNms } from "../fake-librenms.ts";
import { LibreNmsClient } from "../../src/librenms-client.ts";
import { createLibrenmsGetDeviceTool } from "../../src/tools/librenms_get_device.ts";

let fake: FakeLibreNms | null = null;
afterEach(async () => {
  if (fake) await fake.close();
  fake = null;
});

describe("librenms_get_device", () => {
  it("returns the first device entry for the hostname", async () => {
    fake = await startFakeLibreNms([
      {
        method: "GET",
        path: "/api/v0/devices/router-1",
        status: 200,
        body: {
          status: "ok",
          devices: [{ device_id: 7, hostname: "router-1", os: "ios" }],
        },
      },
    ]);
    const tool = createLibrenmsGetDeviceTool(
      () =>
        new LibreNmsClient({
          url: fake!.baseUrl,
          token: "t",
          tlsInsecure: false,
        }),
    );
    const r = await tool.execute("test-id", { hostname: "router-1" });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.device).toEqual({
      device_id: 7,
      hostname: "router-1",
      os: "ios",
    });
  });
});
