import { Agent as UndiciAgent } from "undici";

export interface LibreNmsClientOptions {
  retryDelayMs?: number;
}

export class LibreNmsClientError extends Error {
  constructor(public status: number, message: string) {
    super(`LibreNMS ${status}: ${message}`);
    this.name = "LibreNmsClientError";
  }
}

export class LibreNmsUnreachableError extends Error {
  constructor(cause: string) {
    super(`LibreNMS unreachable: ${cause}`);
    this.name = "LibreNmsUnreachableError";
  }
}

export interface ClientInstanceConfig {
  url: string;
  token: string;
  tlsInsecure: boolean;
}

export class LibreNmsClient {
  private retryDelayMs: number;
  // Node's global fetch (undici) ignores node:https.Agent. To actually skip
  // cert verification for self-signed LibreNMS hosts we pass an undici Agent
  // via the `dispatcher` init option.
  dispatcher?: UndiciAgent;

  constructor(private cfg: ClientInstanceConfig, opts: LibreNmsClientOptions = {}) {
    this.retryDelayMs = opts.retryDelayMs ?? 1000;
    if (cfg.tlsInsecure && cfg.url.startsWith("https://")) {
      this.dispatcher = new UndiciAgent({ connect: { rejectUnauthorized: false } });
    }
  }

  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  async post<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    return this.request<T>("PUT", path, body);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = this.cfg.url + "/api/v0" + path;
    const headers: Record<string, string> = { "x-auth-token": this.cfg.token };
    let bodyStr: string | undefined;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      bodyStr = JSON.stringify(body);
    }
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const init: Record<string, unknown> = { method, headers, body: bodyStr };
        if (this.dispatcher) init.dispatcher = this.dispatcher;
        const res = await fetch(url, init as RequestInit);
        if (res.status >= 200 && res.status < 300) {
          const text = await res.text();
          if (!text) return undefined as T;
          return JSON.parse(text) as T;
        }
        if (res.status >= 500) {
          lastErr = new LibreNmsUnreachableError(`HTTP ${res.status}`);
          if (attempt === 0) await sleep(this.retryDelayMs);
          continue;
        }
        const errText = await res.text();
        let msg = errText;
        try { msg = (JSON.parse(errText) as { message?: string }).message ?? errText; } catch {}
        throw new LibreNmsClientError(res.status, msg);
      } catch (e) {
        if (e instanceof LibreNmsClientError) throw e;
        lastErr = new LibreNmsUnreachableError((e as Error).message);
        if (attempt === 0) await sleep(this.retryDelayMs);
      }
    }
    throw lastErr ?? new LibreNmsUnreachableError("unknown");
  }
}

function sleep(ms: number) { return new Promise<void>((r) => setTimeout(r, ms)); }
