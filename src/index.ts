#!/usr/bin/env node

import { createRequire } from "node:module";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

/** MCP server name exposed to clients during initialization. */
const SERVER_NAME = "mac-use-mcp";

const server = new Server(
  { name: SERVER_NAME, version },
  { capabilities: { tools: {} } },
);

/**
 * List available tools.
 *
 * Returns an empty array for now — tools are registered in later phases.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [],
}));

/**
 * Handle tool invocations.
 *
 * Placeholder that rejects all calls until tools are registered.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => ({
  content: [
    {
      type: "text" as const,
      text: `Unknown tool: ${request.params.name}`,
    },
  ],
  isError: true,
}));

/**
 * Start the MCP server on stdio transport.
 */
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  process.stderr.write(
    `Fatal: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
