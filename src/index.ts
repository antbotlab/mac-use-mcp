#!/usr/bin/env node

import { createRequire } from "node:module";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { ZodError } from "zod";

import {
  utilityToolDefinitions,
  utilityToolHandlers,
} from "./tools/utility.js";
import { screenToolDefinitions, screenToolHandlers } from "./tools/screen.js";
import {
  screenshotToolDefinitions,
  screenshotToolHandlers,
} from "./tools/screenshot.js";
import { mouseToolDefinitions, mouseToolHandlers } from "./tools/mouse.js";
import {
  keyboardToolDefinitions,
  keyboardToolHandlers,
} from "./tools/keyboard.js";
import { windowToolDefinitions, windowToolHandlers } from "./tools/window.js";
import {
  clipboardToolDefinitions,
  clipboardToolHandlers,
} from "./tools/clipboard.js";
import { menuToolDefinitions, menuToolHandlers } from "./tools/menu.js";
import {
  accessibilityToolDefinitions,
  accessibilityToolHandlers,
} from "./tools/accessibility.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

/** MCP server name exposed to clients during initialization. */
const SERVER_NAME = "mac-use-mcp";

/** All registered tool definitions. */
const allToolDefinitions = [
  ...utilityToolDefinitions,
  ...screenToolDefinitions,
  ...screenshotToolDefinitions,
  ...mouseToolDefinitions,
  ...keyboardToolDefinitions,
  ...windowToolDefinitions,
  ...clipboardToolDefinitions,
  ...menuToolDefinitions,
  ...accessibilityToolDefinitions,
];

/** Unified handler map — tool name to async handler function. */
const allToolHandlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<CallToolResult>
> = {
  ...utilityToolHandlers,
  ...screenToolHandlers,
  ...screenshotToolHandlers,
  ...mouseToolHandlers,
  ...keyboardToolHandlers,
  ...windowToolHandlers,
  ...clipboardToolHandlers,
  ...menuToolHandlers,
  ...accessibilityToolHandlers,
};

const server = new Server(
  { name: SERVER_NAME, version },
  { capabilities: { tools: {} } },
);

/**
 * List available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: allToolDefinitions,
}));

/**
 * Handle tool invocations.
 *
 * Dispatches to the matching handler or returns an error for unknown tools.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const handler = allToolHandlers[name];

  if (!handler) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Unknown tool: ${name}`,
        },
      ],
      isError: true,
    };
  }

  try {
    return await handler(args ?? {});
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      const messages = error.issues.map(
        (issue) => `  ${issue.path.join(".")}: ${issue.message}`,
      );
      return {
        content: [
          {
            type: "text" as const,
            text: `Validation error:\n${messages.join("\n")}`,
          },
        ],
        isError: true,
      };
    }
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

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
