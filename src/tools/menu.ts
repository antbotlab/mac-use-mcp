import { z } from "zod";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToToolInputSchema } from "../helpers/schema.js";
import {
  runAppleScript,
  escapeAppleScriptString,
} from "../helpers/applescript.js";
import { resolveAppName } from "../helpers/app-resolver.js";
import { enqueue } from "../queue.js";

// -- Schemas -----------------------------------------------------------------

const ClickMenuInputSchema = z.object({
  app: z.string().describe("Application name"),
  path: z.string().describe('Menu path, e.g. "File > Save As..."'),
});

// -- Constants ---------------------------------------------------------------

/** Minimum number of path segments required (menu bar item + menu item). */
const MIN_PATH_SEGMENTS = 2;

/** Delimiter used to split menu path segments. */
const PATH_DELIMITER = " > ";

// -- Tool definitions --------------------------------------------------------

export const menuToolDefinitions: Tool[] = [
  {
    name: "click_menu",
    description:
      'Click a menu bar item in an application. Specify the menu path as "Menu > Submenu > Item" (e.g., "File > Save As...", "View > Sort By > Name").',
    inputSchema: zodToToolInputSchema(ClickMenuInputSchema),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
    },
  },
];

// -- Helpers -----------------------------------------------------------------

/**
 * Build an AppleScript expression to click a menu item at the given path.
 *
 * Path segments are ordered root-to-leaf:
 *   parts[0]       — menu bar item (top-level menu)
 *   parts[1..n-2]  — intermediate submenus (if any)
 *   parts[n-1]     — leaf menu item to click
 *
 * For 2 segments ("File > Save As..."):
 *   click menu item "Save As..." of menu "File" of menu bar item "File" of menu bar 1
 *
 * For 3+ segments ("View > Sort By > Name"):
 *   click menu item "Name" of menu "Sort By" of menu item "Sort By"
 *     of menu "View" of menu bar item "View" of menu bar 1
 */
function buildMenuClickScript(app: string, parts: string[]): string {
  const safeApp = escapeAppleScriptString(app);
  const escaped = parts.map(escapeAppleScriptString);

  const root = escaped[0];
  const leaf = escaped[escaped.length - 1];

  // Start with the leaf item
  let chain = `click menu item "${leaf}"`;

  // Traverse intermediate submenus from second-to-last down to index 1
  for (let i = escaped.length - 2; i >= 1; i--) {
    chain += ` of menu "${escaped[i]}" of menu item "${escaped[i]}"`;
  }

  // Attach to root menu bar item
  chain += ` of menu "${root}" of menu bar item "${root}" of menu bar 1`;

  return [
    'tell application "System Events"',
    `  tell process "${safeApp}"`,
    `    ${chain}`,
    "  end tell",
    "end tell",
  ].join("\n");
}

// -- Handlers ----------------------------------------------------------------

/** Handle click_menu tool call. */
async function handleClickMenu(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = ClickMenuInputSchema.parse(args);
  const parts = parsed.path.split(PATH_DELIMITER);

  if (parts.length < MIN_PATH_SEGMENTS) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Invalid menu path: expected at least ${MIN_PATH_SEGMENTS} segments separated by "${PATH_DELIMITER}", got ${parts.length}. Example: "File > Save As..."`,
        },
      ],
      isError: true,
    };
  }

  const app = await resolveAppName(parsed.app);
  const script = buildMenuClickScript(app, parts);
  await runAppleScript(script);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          app: parsed.app,
          path: parsed.path,
        }),
      },
    ],
  };
}

// -- Dispatcher --------------------------------------------------------------

/** Map of menu tool names to their handler functions (queued). */
export const menuToolHandlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<CallToolResult>
> = {
  click_menu: (args) => enqueue(() => handleClickMenu(args)),
};
