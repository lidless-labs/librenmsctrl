import { Effect } from "effect";
import { Agent as UndiciAgent } from "undici";
import {
  buildUrl,
  exponentialRetry,
  sendRequest,
  TransportError,
  UnexpectedStatusError,
  withRetry,
  type AuthStrategy,
  type HttpContext,
  type HttpMethod,
  type HttpRequest,
  type OperatorError,
} from "@lidless-labs/effect-operator-kit";

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

  async delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>("DELETE", path);
  }

  private async request<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
    const baseUrl = new URL(`${this.cfg.url}/`);
    const requestPath = `api/v0${path}`;
    buildUrl(baseUrl, requestPath);

    const auth: AuthStrategy = {
      apply: (headers) => {
        headers.set("x-auth-token", this.cfg.token);
        return Effect.succeed(headers);
      },
    };
    const req: HttpRequest = {
      method,
      path: requestPath,
      body,
      bodyEncoding: body !== undefined ? "json" : "none",
      statusMapper: ({ status, method: mappedMethod, path: mappedPath, bodyText, expectedStatuses }) =>
        new UnexpectedStatusError({
          method: mappedMethod,
          path: mappedPath,
          status,
          body: bodyText,
          expected: expectedStatuses,
        }),
    };
    const ctx: HttpContext = {
      baseUrl,
      auth,
      timeoutMs: 2_147_483_647,
      fetch: this.fetchWithDispatcher,
      redact: (value) => value,
    };
    const result = await Effect.runPromise(
      Effect.either(
        withRetry(
          sendRequest<T>(ctx, req),
          exponentialRetry({
            maxAttempts: 2,
            initialDelayMs: this.retryDelayMs,
            maxDelayMs: this.retryDelayMs,
            factor: 1,
            jitter: false,
            shouldRetry: shouldRetryLibreNmsRequest,
          }),
        ),
      ),
    );
    if (result._tag === "Right") {
      return result.right.body;
    }
    throw mapLibreNmsRequestError(result.left);
  }

  private fetchWithDispatcher: typeof fetch = (input, init = {}) => {
    if (!this.dispatcher) return fetch(input, init);
    return fetch(input, { ...init, dispatcher: this.dispatcher } as RequestInit);
  };
}

function shouldRetryLibreNmsRequest(error: OperatorError): boolean {
  if (error instanceof TransportError) return true;
  if (error instanceof UnexpectedStatusError) return error.status >= 500;
  return false;
}

function mapLibreNmsRequestError(error: OperatorError): Error {
  if (error instanceof UnexpectedStatusError) {
    if (error.status >= 500) return new LibreNmsUnreachableError(`HTTP ${error.status}`);
    return new LibreNmsClientError(error.status, responseErrorMessage(error.body));
  }
  if (error instanceof TransportError) {
    const cause = error.cause;
    return new LibreNmsUnreachableError(cause instanceof Error ? cause.message : String(cause));
  }
  return new LibreNmsUnreachableError(error instanceof Error ? error.message : String(error));
}

function responseErrorMessage(bodyText: string): string {
  try {
    return (JSON.parse(bodyText) as { message?: string }).message ?? bodyText;
  } catch {
    return bodyText;
  }
}
