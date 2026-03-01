import { z } from "zod";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToToolInputSchema } from "../helpers/schema.js";
import { runInputHelper } from "../helpers/input-helper.js";
import { resolveAppName } from "../helpers/app-resolver.js";
import { enqueue } from "../queue.js";

// -- Schemas -----------------------------------------------------------------

const GetUIElementsInputSchema = z.object({
  app: z
    .string()
    .optional()
    .describe(
      "Target application name. Default: frontmost app. Supports fuzzy matching.",
    ),
  role: z
    .string()
    .optional()
    .describe(
      'Filter by AX role: "AXButton", "AXTextField", "AXStaticText", etc.',
    ),
  title: z
    .string()
    .optional()
    .describe("Filter by element title (substring, case-insensitive)."),
  max_depth: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(5)
    .describe("Max tree traversal depth (default: 5)."),
});

// -- Tool definitions --------------------------------------------------------

export const accessibilityToolDefinitions: Tool[] = [
  {
    name: "get_ui_elements",
    description:
      "Query visible UI elements of an application via macOS Accessibility API. " +
      "Returns element roles, titles, positions (screen coordinates), sizes, and states. " +
      "Positions are in logical screen coordinates — pass directly to click tool. " +
      "Coverage varies: native apps expose rich trees; Electron/web apps may expose partial trees; " +
      "games/custom UIs may expose nothing. Requires Accessibility permission.",
    inputSchema: zodToToolInputSchema(GetUIElementsInputSchema),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
];

// -- Handlers ----------------------------------------------------------------

/** Handle get_ui_elements tool call. */
async function handleGetUIElements(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = GetUIElementsInputSchema.parse(args);

  const helperArgs: Record<string, unknown> = {
    max_depth: parsed.max_depth,
  };
  if (parsed.app) {
    helperArgs.app = await resolveAppName(parsed.app);
  }
  if (parsed.role) helperArgs.role = parsed.role;
  if (parsed.title) helperArgs.title = parsed.title;

  const response = await runInputHelper("get_ui_elements", helperArgs);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(response, null, 2),
      },
    ],
  };
}

// -- Dispatcher --------------------------------------------------------------

/** Map of accessibility tool names to their handler functions (queued). */
export const accessibilityToolHandlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<CallToolResult>
> = {
  get_ui_elements: (args) => enqueue(() => handleGetUIElements(args)),
};
