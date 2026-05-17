import { describe, it, expect, afterEach } from "vitest";
import { startFakeLibreNms, type FakeLibreNms } from "../fake-librenms.ts";
import { LibreNmsClient } from "../../src/librenms-client.ts";
import { createLibrenmsStatusTool } from "../../src/tools/librenms_status.ts";

let fake: FakeLibreNms | null = null;
afterEach(async () => {
  if (fake) await fake.close();
  fake = null;
});

describe("librenms_status", () => {
  it("returns the first system entry", async () => {
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
    ]);
    const tool = createLibrenmsStatusTool(
      () =>
        new LibreNmsClient({
          url: fake!.baseUrl,
          token: "t",
          tlsInsecure: false,
        }),
    );
    const r = await tool.execute();
    const payload = JSON.parse(r.content[0].text);
    expect(payload.system).toEqual({
      version: "23.11.0",
      database_ver: "2024_01_01",
      local_disk: "/opt/librenms",
    });
  });
});
