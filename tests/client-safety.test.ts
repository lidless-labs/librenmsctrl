import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { LibreNmsClient, LibreNmsUnreachableError } from "../src/librenms-client.ts";

const servers: Server[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
async function serve(handler: (req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse) => void): Promise<string> {
  const server = createServer(handler);
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
function client(url: string, timeout = 1000) {
  return new LibreNmsClient({ url, token: "redirect-test-token", tlsInsecure: false, requestTimeoutMs: timeout }, { retryDelayMs: 1 });
}

describe("LibreNMS HTTP safety", () => {
  it.each([301, 302, 303, 307, 308])("rejects %i redirects without forwarding custom auth", async (status) => {
    const received: string[] = [];
    const destination = await serve((req, res) => {
      received.push(String(req.headers["x-auth-token"]));
      res.end('{}');
    });
    let sourceRequests = 0;
    const source = await serve((_req, res) => {
      sourceRequests++;
      res.writeHead(status, { location: destination });
      res.end();
    });
    await expect(client(source).get("/system")).rejects.toThrow(LibreNmsUnreachableError);
    expect(received).toEqual([]);
    expect(sourceRequests).toBe(1);
  });

  it.each(["stalled", "partial"])("keeps deadline active through a %s body", async (mode) => {
    const url = await serve((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.flushHeaders();
      if (mode === "partial") res.write('{"devices":[');
      const timer = setTimeout(() => res.end(mode === "partial" ? ']}' : '{}'), 350);
      res.on("close", () => clearTimeout(timer));
    });
    const started = Date.now();
    await expect(client(url, 50).get("/devices")).rejects.toThrow(/timed out after 50ms/);
    expect(Date.now() - started).toBeLessThan(300);
  });

  it.each([200, 503])("bounds a streamed %i response before parsing or retrying", async (status) => {
    let requests = 0;
    const url = await serve((_req, res) => {
      requests++;
      res.writeHead(status, { "content-type": "application/json" });
      res.write('"');
      res.end('x'.repeat(10 * 1024 * 1024) + '"');
    });
    await expect(client(url).get("/devices")).rejects.toThrow(/response exceeded 10485760 bytes/);
    expect(requests).toBe(1);
  });

  it.each(
    (["post", "put", "delete"] as const).flatMap((method) =>
      ["status", "parse", "transport", "partial", "timeout"].map((failure) => ({ method, failure })),
    ),
  )("never replays $method after $failure failure", async ({ method, failure }) => {
    let writes = 0;
    const url = await serve((req, res) => {
      writes++;
      if (failure === "transport") { req.socket.destroy(); return; }
      if (failure === "status") { res.writeHead(503); res.end('{}'); return; }
      if (failure === "parse") { res.end('invalid'); return; }
      res.writeHead(200);
      res.write('{');
      if (failure === "partial") { setImmediate(() => res.destroy()); return; }
      const timer = setTimeout(() => res.end('}'), 350);
      res.on("close", () => clearTimeout(timer));
    });
    const c = client(url, 50);
    await expect(c[method]("/alerts/42", { state: 2 })).rejects.toThrow(LibreNmsUnreachableError);
    expect(writes).toBe(1);
  });

  it("preserves dispatcher, redirect policy, and abort signal at the fetch boundary", async () => {
    let received: (RequestInit & { dispatcher?: unknown }) | undefined;
    const c = new LibreNmsClient(
      { url: "https://librenms.example", token: "t", tlsInsecure: true },
      { fetch: async (_input, init) => {
        received = init;
        return new Response('{}');
      } },
    );
    try {
      await expect(c.get("/system")).resolves.toEqual({});
      expect(received?.dispatcher).toBe(c.dispatcher);
      expect(received?.signal).toBeInstanceOf(AbortSignal);
      expect(received?.redirect).toBe("manual");
    } finally {
      await c.dispatcher?.close();
    }
  });

  it("retains GET availability retry", async () => {
    let reads = 0;
    const url = await serve((_req, res) => {
      reads++;
      res.writeHead(reads === 1 ? 503 : 200);
      res.end('{}');
    });
    await expect(client(url).get("/system")).resolves.toEqual({});
    expect(reads).toBe(2);
  });
});
