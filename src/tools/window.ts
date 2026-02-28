import { z } from "zod";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToToolInputSchema } from "../helpers/schema.js";
import { execFileAsync } from "../helpers/exec.js";
import { runAppleScript, escapeAppleScriptString } from "../helpers/applescript.js";
import { runInputHelper } from "../helpers/input-helper.js";
import { OPEN_COMMAND_TIMEOUT_MS } from "../constants.js";
import { enqueue } from "../queue.js";

// -- Schemas -----------------------------------------------------------------

const ListWindowsInputSchema = z.object({
  app: z
    .string()
    .optional()
    .describe("Application name to filter by. If omitted, list windows from all applications."),
});

const FocusWindowInputSchema = z.object({
  app: z.string().describe("Application name to activate."),
  title: z
    .string()
    .optional()
    .describe("Window title to raise. If omitted, the frontmost window of the application is activated."),
});

const OpenApplicationInputSchema = z.object({
  name: z
    .string()
    .describe("Application name (e.g. \"Safari\") or bundle identifier (e.g. \"com.apple.Safari\")."),
});

/** Schema for validating the Swift helper list_windows response. */
export const ListWindowsResponseSchema = z.object({
  success: z.boolean(),
  windows: z.array(z.object({
    app: z.string(),
    title: z.string(),
    id: z.number(),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    minimized: z.boolean(),
  })),
});

// -- Types -------------------------------------------------------------------

/** Window information returned by list_windows. */
interface WindowInfo {
  app: string;
  title: string;
  id: number;
  position: { x: number; y: number };
  size: { w: number; h: number };
  minimized: boolean;
}

// -- Tool definitions --------------------------------------------------------

export const windowToolDefinitions: Tool[] = [
  {
    name: "list_windows",
    description:
      "List visible windows with their app name, title, ID, position, size, and minimized state. Optionally filter by application name.",
    inputSchema: zodToToolInputSchema(ListWindowsInputSchema),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  {
    name: "focus_window",
    description:
      "Activate an application and optionally raise a specific window by title.",
    inputSchema: zodToToolInputSchema(FocusWindowInputSchema),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "open_application",
    description:
      "Launch an application by name or bundle identifier.",
    inputSchema: zodToToolInputSchema(OpenApplicationInputSchema),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
];

// -- Helpers -----------------------------------------------------------------

/**
 * Reverse-DNS pattern: at least 3 dot-separated segments, each starting with
 * a letter and containing only alphanumerics, hyphens, or underscores
 * (e.g. "com.apple.Safari", "com.apple.driver.Apple_HDA").
 */
const BUNDLE_ID_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z][a-zA-Z0-9_-]*){2,}$/;

/**
 * Detect whether a name looks like a bundle identifier (reverse-DNS format).
 */
function isBundleId(name: string): boolean {
  return BUNDLE_ID_PATTERN.test(name);
}

// -- Handlers ----------------------------------------------------------------

/** Handle list_windows tool call. */
async function handleListWindows(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = ListWindowsInputSchema.parse(args);
  const response = await runInputHelper("list_windows", parsed.app ? { app: parsed.app } : {});
  const result = ListWindowsResponseSchema.parse(response);

  const windows: WindowInfo[] = result.windows.map(w => ({
    app: w.app,
    title: w.title,
    id: w.id,
    position: { x: w.x, y: w.y },
    size: { w: w.width, h: w.height },
    minimized: w.minimized,
  }));

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ windows }, null, 2),
      },
    ],
  };
}

/** Handle focus_window tool call. */
async function handleFocusWindow(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = FocusWindowInputSchema.parse(args);
  const safeApp = escapeAppleScriptString(parsed.app);

  // Activate the application
  let script = `tell application "${safeApp}" to activate`;

  // If a specific window title is requested, raise it via System Events
  if (parsed.title) {
    const safeTitle = escapeAppleScriptString(parsed.title);
    script += `
delay 0.3
tell application "System Events"
  tell process "${safeApp}"
    set frontmost to true
    try
      perform action "AXRaise" of (first window whose name is "${safeTitle}")
    on error
      error "Window titled \\"${safeTitle}\\" not found in ${safeApp}"
    end try
  end tell
end tell`;
  }

  await runAppleScript(script);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          app: parsed.app,
          ...(parsed.title ? { title: parsed.title } : {}),
        }),
      },
    ],
  };
}

/** Handle open_application tool call. */
async function handleOpenApplication(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = OpenApplicationInputSchema.parse(args);
  const name = parsed.name;

  // Determine whether to use -a (app name) or -b (bundle ID)
  const flag = isBundleId(name) ? "-b" : "-a";

  try {
    await execFileAsync("open", [flag, name], {
      timeout: OPEN_COMMAND_TIMEOUT_MS,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            success: false,
            error: `Failed to open application "${name}": ${msg}`,
          }),
        },
      ],
      isError: true,
    };
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ success: true, app: name }),
      },
    ],
  };
}

// -- Dispatcher --------------------------------------------------------------

/** Map of window tool names to their handler functions (queued). */
export const windowToolHandlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<CallToolResult>
> = {
  list_windows: (args) => enqueue(() => handleListWindows(args)),
  focus_window: (args) => enqueue(() => handleFocusWindow(args)),
  open_application: (args) => enqueue(() => handleOpenApplication(args)),
};
