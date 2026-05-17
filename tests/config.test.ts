import { describe, it, expect } from "vitest";
import { resolveConfig, ConfigError } from "../src/config.ts";

describe("resolveConfig", () => {
  it("parses required env", () => {
    const cfg = resolveConfig({
      LIBRENMS_URL: "https://librenms.local",
      LIBRENMS_TOKEN: "abc123",
    });
    expect(cfg.url).toBe("https://librenms.local");
    expect(cfg.token).toBe("abc123");
    expect(cfg.tlsInsecure).toBe(false);
  });

  it("parses TLS-insecure flag (true/1/yes case-insensitive)", () => {
    for (const v of ["true", "True", "1", "yes", "YES"]) {
      const cfg = resolveConfig({
        LIBRENMS_URL: "https://x",
        LIBRENMS_TOKEN: "t",
        LIBRENMS_TLS_INSECURE: v,
      });
      expect(cfg.tlsInsecure).toBe(true);
    }
  });

  it("TLS-insecure defaults false on falsy values", () => {
    for (const v of ["false", "0", "no", "", undefined]) {
      const cfg = resolveConfig({
        LIBRENMS_URL: "https://x",
        LIBRENMS_TOKEN: "t",
        ...(v === undefined ? {} : { LIBRENMS_TLS_INSECURE: v }),
      });
      expect(cfg.tlsInsecure).toBe(false);
    }
  });

  it("throws ConfigError on missing LIBRENMS_URL", () => {
    expect(() => resolveConfig({ LIBRENMS_TOKEN: "t" })).toThrow(ConfigError);
  });

  it("throws ConfigError on missing LIBRENMS_TOKEN", () => {
    expect(() => resolveConfig({ LIBRENMS_URL: "https://x" })).toThrow(ConfigError);
  });

  it("strips trailing slash from LIBRENMS_URL", () => {
    const cfg = resolveConfig({
      LIBRENMS_URL: "https://librenms.local/",
      LIBRENMS_TOKEN: "t",
    });
    expect(cfg.url).toBe("https://librenms.local");
  });

  it("strips multiple trailing slashes", () => {
    const cfg = resolveConfig({
      LIBRENMS_URL: "https://librenms.local///",
      LIBRENMS_TOKEN: "t",
    });
    expect(cfg.url).toBe("https://librenms.local");
  });
});
