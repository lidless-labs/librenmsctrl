export interface LibreNmsConfig {
  url: string;
  token: string;
  tlsInsecure: boolean;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

function isTruthy(value: string | undefined): boolean {
  if (!value) return false;
  return ["true", "1", "yes"].includes(value.toLowerCase());
}

export function resolveConfig(env: Record<string, string | undefined>): LibreNmsConfig {
  const url = env.LIBRENMS_URL;
  const token = env.LIBRENMS_TOKEN;
  if (!url) throw new ConfigError("LIBRENMS_URL is required");
  if (!token) throw new ConfigError("LIBRENMS_TOKEN is required");
  return {
    url: url.replace(/\/+$/, ""),
    token,
    tlsInsecure: isTruthy(env.LIBRENMS_TLS_INSECURE),
  };
}
