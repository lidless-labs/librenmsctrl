import { describe, it, expect, afterEach } from "vitest";
import { startFakeLibreNms, FakeLibreNms } from "./fake-librenms.ts";
import { LibreNmsClient, LibreNmsClientError, LibreNmsUnreachableError } from "../src/librenms-client.ts";

let fake: FakeLibreNms | null = null;
afterEach(async () => { if (fake) await fake.close(); fake = null; });

describe("LibreNmsClient", () => {
  it("sends X-Auth-Token header", async () => {
    fake = await startFakeLibreNms([
      { method: "GET", path: "/api/v0/system", status: 200, body: { status: "ok", system: [{ version: "23.11.0" }] } },
    ]);
    const c = new LibreNmsClient({ url: fake.baseUrl, token: "secret-token", tlsInsecure: false });
    const r = await c.get<unknown>("/system");
    expect(r).toBeDefined();
    expect(fake.requests[0].path).toBe("/api/v0/system");
    expect(fake.requests[0].headers["x-auth-token"]).toBe("secret-token");
  });

  it("throws LibreNmsClientError on 401", async () => {
    fake = await startFakeLibreNms([
      { method: "GET", path: "/api/v0/system", status: 401, body: { status: "error", message: "bad token" } },
    ]);
    const c = new LibreNmsClient({ url: fake.baseUrl, token: "bad", tlsInsecure: false });
    await expect(c.get("/system")).rejects.toThrow(LibreNmsClientError);
  });

  it("retries once on 5xx then throws Unreachable", async () => {
    fake = await startFakeLibreNms([
      { method: "GET", path: "/api/v0/system", status: 502, body: { status: "error" } },
    ]);
    const c = new LibreNmsClient({ url: fake.baseUrl, token: "t", tlsInsecure: false }, { retryDelayMs: 5 });
    await expect(c.get("/system")).rejects.toThrow(LibreNmsUnreachableError);
    expect(fake.requests).toHaveLength(2);
  });

  it("does not include token in thrown error messages", async () => {
    fake = await startFakeLibreNms([
      { method: "GET", path: "/api/v0/system", status: 401, body: { status: "error", message: "unauthorized" } },
    ]);
    const c = new LibreNmsClient({ url: fake.baseUrl, token: "super-secret-token", tlsInsecure: false });
    try {
      await c.get("/system");
    } catch (e) {
      expect((e as Error).message).not.toContain("super-secret-token");
    }
  });

  it("posts JSON body via PUT", async () => {
    fake = await startFakeLibreNms([
      { method: "PUT", path: "/api/v0/alerts/42", status: 200, body: { status: "ok" } },
    ]);
    const c = new LibreNmsClient({ url: fake.baseUrl, token: "t", tlsInsecure: false });
    await c.put("/alerts/42", { state: 2, note: "ack" });
    expect(fake.requests[0].method).toBe("PUT");
    expect(fake.requests[0].headers["content-type"]).toBe("application/json");
    const body = JSON.parse(fake.requests[0].body);
    expect(body.state).toBe(2);
    expect(body.note).toBe("ack");
  });
});
