import { describe, it, expect, afterEach } from "vitest";
import { startFakeLibreNms, type FakeLibreNms } from "../fake-librenms.ts";
import { LibreNmsClient } from "../../src/librenms-client.ts";
import { createLibrenmsPortHealthTool } from "../../src/tools/librenms_port_health.ts";

let fake: FakeLibreNms | null = null;
afterEach(async () => {
  if (fake) await fake.close();
  fake = null;
});

const PATH =
  "/api/v0/ports?columns=device_id,ifName,ifInErrors,ifOutErrors,ifSpeed,ifInOctets,ifOutOctets";

describe("librenms_port_health", () => {
  it("sorts by errors_in by default and slices to default limit", async () => {
    const ports = [
      { device_id: 1, ifName: "a", ifInErrors: 5, ifOutErrors: 0 },
      { device_id: 1, ifName: "b", ifInErrors: 100, ifOutErrors: 0 },
      { device_id: 1, ifName: "c", ifInErrors: 50, ifOutErrors: 0 },
    ];
    fake = await startFakeLibreNms([
      {
        method: "GET",
        path: PATH,
        status: 200,
        body: { status: "ok", ports },
      },
    ]);
    const tool = createLibrenmsPortHealthTool(
      () =>
        new LibreNmsClient({
          url: fake!.baseUrl,
          token: "t",
          tlsInsecure: false,
        }),
    );
    const r = await tool.execute("test-id", {});
    const payload = JSON.parse(r.content[0].text);
    expect(payload.metric).toBe("errors_in");
    expect(payload.limit).toBe(10);
    expect(payload.top.map((p: { ifName: string }) => p.ifName)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("honors limit and errors_out metric", async () => {
    const ports = [
      { device_id: 1, ifName: "a", ifInErrors: 0, ifOutErrors: 3 },
      { device_id: 1, ifName: "b", ifInErrors: 0, ifOutErrors: 9 },
      { device_id: 1, ifName: "c", ifInErrors: 0, ifOutErrors: 7 },
    ];
    fake = await startFakeLibreNms([
      {
        method: "GET",
        path: PATH,
        status: 200,
        body: { status: "ok", ports },
      },
    ]);
    const tool = createLibrenmsPortHealthTool(
      () =>
        new LibreNmsClient({
          url: fake!.baseUrl,
          token: "t",
          tlsInsecure: false,
        }),
    );
    const r = await tool.execute("test-id", { limit: 2, metric: "errors_out" });
    const payload = JSON.parse(r.content[0].text);
    expect(payload.metric).toBe("errors_out");
    expect(payload.limit).toBe(2);
    expect(payload.top).toHaveLength(2);
    expect(payload.top[0].ifName).toBe("b");
    expect(payload.top[1].ifName).toBe("c");
  });
});
