import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "cli": "src/cli.ts",
    "mcp-bin": "mcp-bin.ts",
    "mcp-server": "mcp-server.ts",
    "index": "index.ts",
  },
  format: ["esm"],
  target: "node20",
  clean: true,
  dts: false,
  splitting: false,
  sourcemap: false,
  noExternal: ["@lidless-labs/effect-operator-kit"],
  external: [/^openclaw(\/|$)/, "undici"],
  banner: { js: "#!/usr/bin/env node" },
});
