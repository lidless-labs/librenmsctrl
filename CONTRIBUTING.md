# Contributing to librenms-mcp

librenms-mcp is an MCP server that exposes [LibreNMS](https://www.librenms.org/) network monitoring to AI clients, with a three-tier write gate in front of anything that changes state. It is a work in progress, and patches are welcome. Before you start, please skim this file so we both spend our time on the right things.

## What kinds of changes land easily

- **Bug fixes** in a tool, the LibreNMS client, the config resolver, the write gates, or input validation.
- **New read tools** that map cleanly onto a LibreNMS `/api/v0` read endpoint, with a TypeBox `inputSchema` and a test.
- **Tighter input validation**: sharper bounds or enum checks on tool arguments.
- **Doc fixes**: corrections to the README tool list, config table, or client-config snippets.
- **Test coverage** for any of the above.

## What needs a conversation first

- **Any tier-2 (safe write) or tier-3 (destructive) tool.** Writes go through the gate pattern for a reason. Open an issue describing the LibreNMS endpoint, the tier, and why the gate is sufficient before sending a PR.
- **Changes to the write-gate or redactor logic.** These are the security surface; renaming or loosening them later is painful.
- **Anything that adds a runtime dependency.** The dependency surface is intentionally small.

## What does not land

- Personal details, hostnames, real IPs, account ids, or live tokens in code, tests, or docs. Use `192.0.2.x` (RFC 5737) and `librenms.example.local` style placeholders. The content-guard checks reject anything else.
- A write tool that runs without an explicit `confirm: true`, or any tier-3 destructive operation in v1.
- AI co-authorship trailers on commits (`Co-Authored-By: <model>`). Conventional commits only.

## Local dev

```bash
git clone https://github.com/lidless-labs/librenms-mcp.git
cd librenms-mcp
npm install
npm run typecheck
npm test
npm run build
```

The server entry point is [`mcp-server.ts`](mcp-server.ts); tool factories live under [`src/tools/`](src/tools/), one file per tool, re-exported from `src/tools/index.ts`. The LibreNMS HTTP client is in `src/librenms-client.ts`, config resolution in `src/config.ts`, the write gates in `src/gates.ts`, and argument validation in `src/validate.ts`.

To smoke-test the server over stdio without a real LibreNMS instance, send it a `tools/list` request:

```bash
LIBRENMS_URL=https://librenms.example.local LIBRENMS_TOKEN=test \
  bash -c 'echo "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}" | npm run -s start'
```

## Adding a read tool

1. Create `src/tools/librenms_<name>.ts` exporting a `createLibrenms<Name>Tool(getClient)` factory that returns `{ name, description, parameters, execute }`.
2. Define `parameters` as a TypeBox schema so the argument is validated before the tool runs.
3. Re-export the factory from `src/tools/index.ts` and register it in the `tools` array in `mcp-server.ts`.
4. Add a test under `tests/tools/`.
5. Add the tool to the README tool table.

## Filing issues

Please use the templates under [`.github/ISSUE_TEMPLATE/`](.github/ISSUE_TEMPLATE/). Before posting any output, remove tokens, private hostnames, private repo names, and unredacted absolute paths.

## License

By contributing you agree that your contribution is licensed under the MIT License, same as the rest of the repo.
