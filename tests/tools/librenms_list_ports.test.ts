import { describe, it, expect, afterEach } from "vitest";
import { startFakeLibreNms, type FakeLibreNms } from "../fake-librenms.ts";
import { LibreNmsClient } from "../../src/librenms-client.ts";
import { createLibrenmsListPortsTool } from "../../src/tools/librenms_list_ports.ts";

let fake: FakeLibreNms | null = null;
afterEach(async () => {
  if (fake) await fake.close();
  fake = null;
});

describe("librenms_list_ports", () => {
  it("requests the configured column set and returns ports", async () => {
    const path =
      "/api/v0/devices/router-1/ports?columns=ifName,ifAdminStatus,ifOperStatus,ifInErrors,ifOutErrors,ifSpeed,ifDescr";
    fake = await startFakeLibreNms([
      {
        method: "GET",
        path,
        status: 200,
        body: {
          status: "ok",
          ports: [
            {
              ifName: "Gi0/1",
              ifAdminStatus: "up",
              ifOperStatus: "up",
              ifInErrors: 0,
              ifOutErrors: 0,
              ifSpeed: 1000000000,
              ifDescr: "uplink",
            },
          ],
        },
      },
    ]);
    const tool = createLibrenmsListPortsTool(
      () =>
        new LibreNmsClient({
          url: fake!.baseUrl,
          token: "t",
          tlsInsecure: false,
        }),
    );
    const r = await tool.execute("test-id", { hostname: "router-1" });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.ports).toHaveLength(1);
    expect(payload.ports[0].ifName).toBe("Gi0/1");
    expect(fake!.requests[0].path).toBe(path);
  });
});
