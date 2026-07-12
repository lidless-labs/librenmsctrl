import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { run, type CliDeps } from "../src/cli.ts";
import { LibreNmsClient, LibreNmsClientError, LibreNmsUnreachableError } from "../src/librenms-client.ts";
import { startFakeLibreNms, type FakeLibreNms } from "./fake-librenms.ts";

function deps(overrides: Partial<CliDeps> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const base: CliDeps = {
    out: (s) => out.push(s),
    err: (s) => err.push(s),
    makeClient: () =>
      ({
        get: vi.fn().mockResolvedValue({ system: [{ version: "24.1.0" }] }),
      }) as unknown as LibreNmsClient,
    serve: vi.fn().mockResolvedValue(undefined),
  };
  return { out, err, deps: { ...base, ...overrides } };
}

function runCli(args: string[], env: Record<string, string | undefined> = {}) {
  const mergedEnv = { ...process.env, ...env };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete mergedEnv[key];
  }
  return spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: process.cwd(),
    env: mergedEnv,
    encoding: "utf8",
  });
}

let fake: FakeLibreNms | null = null;

afterEach(async () => {
  if (fake) await fake.close();
  fake = null;
});

describe("golden programmatic CLI contracts", () => {
  it("rejects with the original error when client construction fails", async () => {
    const constructionError = new Error("LIBRENMS_URL is required");
    const captured = deps({
      makeClient: () => {
        throw constructionError;
      },
    });

    await expect(run(["status"], captured.deps)).rejects.toBe(constructionError);
    expect(captured.err).toEqual([]);
  });

  it("preserves startup rejection identity on the mcp path", async () => {
    const startupError = new Error("stdio startup failed");
    const captured = deps({
      serve: vi.fn().mockRejectedValue(startupError),
    });

    await expect(run(["mcp"], captured.deps)).rejects.toBe(startupError);
  });

  it("returns exit 2 and current stderr shape for an unknown command", async () => {
    const captured = deps();

    await expect(run(["bogus"], captured.deps)).resolves.toBe(2);

    expect(captured.err[0]).toBe("Unknown command: bogus");
    expect(captured.err[1]).toBe("");
    expect(captured.err.join("\n")).toContain("Usage:");
  });

  it("returns exit 1 and current stderr shape for a failed API call", async () => {
    const client = {
      get: vi.fn().mockRejectedValue(new Error("LibreNMS unreachable: fetch failed")),
    } as unknown as LibreNmsClient;
    const captured = deps({ makeClient: () => client });

    await expect(run(["status"], captured.deps)).resolves.toBe(1);

    expect(captured.err).toEqual(["LibreNMS unreachable: fetch failed"]);
  });
});

describe("golden CLI entrypoint exit and stderr contracts", () => {
  it("exits 1 and prints current missing-config stderr", () => {
    const result = runCli(["status"], {
      LIBRENMS_URL: undefined,
      LIBRENMS_TOKEN: undefined,
      LIBRENMS_TLS_INSECURE: undefined,
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("LIBRENMS_URL is required\n");
  });

  it("exits 2 and prints current unknown-command stderr", () => {
    const result = runCli(["bogus"], {
      LIBRENMS_URL: "http://127.0.0.1:9",
      LIBRENMS_TOKEN: "token",
    });

    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown command: bogus\n\n");
    expect(result.stderr).toContain("Usage:");
  });

  it("exits 1 and prints current failed-API stderr", () => {
    const result = runCli(["status"], {
      LIBRENMS_URL: "http://127.0.0.1:9",
      LIBRENMS_TOKEN: "token",
    });

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("LibreNMS unreachable: fetch failed\n");
  });
});

describe("golden LibreNMS client auth and retry contracts", () => {
  it("sends x-auth-token exactly and never sends Authorization", async () => {
    fake = await startFakeLibreNms([
      {
        method: "GET",
        path: "/api/v0/system",
        status: 200,
        body: { status: "ok", system: [{ version: "24.1.0" }] },
      },
    ]);
    const client = new LibreNmsClient({
      url: fake.baseUrl,
      token: "secret-token",
      tlsInsecure: false,
    });

    await client.get("/system");

    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0].headers["x-auth-token"]).toBe("secret-token");
    expect(fake.requests[0].headers.authorization).toBeUndefined();
    expect(Object.keys(fake.requests[0].headers)).not.toContain("authorization");
  });

  it("retries once for current 5xx unreachable semantics", async () => {
    fake = await startFakeLibreNms([
      {
        method: "GET",
        path: "/api/v0/system",
        status: 502,
        body: { status: "error", message: "bad gateway" },
      },
    ]);
    const client = new LibreNmsClient(
      { url: fake.baseUrl, token: "token", tlsInsecure: false },
      { retryDelayMs: 1 },
    );

    await expect(client.get("/system")).rejects.toThrow(LibreNmsUnreachableError);
    expect(fake.requests).toHaveLength(2);
  });

  it("does not retry current 4xx client-error semantics", async () => {
    fake = await startFakeLibreNms([
      {
        method: "GET",
        path: "/api/v0/system",
        status: 401,
        body: { status: "error", message: "bad token" },
      },
    ]);
    const client = new LibreNmsClient(
      { url: fake.baseUrl, token: "bad-token", tlsInsecure: false },
      { retryDelayMs: 1 },
    );

    await expect(client.get("/system")).rejects.toThrow(LibreNmsClientError);
    expect(fake.requests).toHaveLength(1);
  });
});
