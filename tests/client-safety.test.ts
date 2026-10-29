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
  it.each(["post", "put", "delete"] as const)("never replays %s after an ambiguous failure", async (method) => {
    for (const failure of ["status", "parse", "transport", "partial", "timeout"]) {
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
      expect(writes, `${method} ${failure}`).toBe(1);
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
