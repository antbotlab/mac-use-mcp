import { z } from "zod";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToToolInputSchema } from "../helpers/schema.js";
import { execFileAsync } from "../helpers/exec.js";
import { runAppleScript, escapeAppleScriptString } from "../helpers/applescript.js";
import { enqueue } from "../queue.js";

// -- Constants ---------------------------------------------------------------

/** Timeout for the `open` command (ms). */
const OPEN_COMMAND_TIMEOUT_MS = 5_000;

/** Delimiter used to separate fields in AppleScript output. */
const FIELD_DELIMITER = "|||";

/** Delimiter used to separate window records in AppleScript output. */
const RECORD_DELIMITER = "<<<>>>";

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
 * Build the AppleScript that queries window information from System Events.
 *
 * When `app` is provided, only that process is queried. Otherwise all
 * processes with visible windows are enumerated.
 *
 * Each window is emitted as a delimited record to make parsing robust
 * against window titles that contain special characters.
 */
function buildListWindowsScript(app?: string): string {
  const fd = FIELD_DELIMITER;
  const rd = RECORD_DELIMITER;

  if (app) {
    const safeApp = escapeAppleScriptString(app);
    return `
tell application "System Events"
  if not (exists process "${safeApp}") then
    return "NOT_RUNNING"
  end if
  set output to ""
  tell process "${safeApp}"
    set winList to every window
    repeat with w in winList
      set wName to name of w
      set wId to id of w
      set wPos to position of w
      set wSize to size of w
      set wMin to value of attribute "AXMinimized" of w
      set output to output & "${safeApp}" & "${fd}" & wName & "${fd}" & wId & "${fd}" & (item 1 of wPos) & "${fd}" & (item 2 of wPos) & "${fd}" & (item 1 of wSize) & "${fd}" & (item 2 of wSize) & "${fd}" & wMin & "${rd}"
    end repeat
  end tell
  return output
end tell`;
  }

  return `
tell application "System Events"
  set output to ""
  set procList to every process whose background only is false
  repeat with proc in procList
    set procName to name of proc
    try
      set winList to every window of proc
      repeat with w in winList
        set wName to name of w
        set wId to id of w
        set wPos to position of w
        set wSize to size of w
        set wMin to value of attribute "AXMinimized" of w
        set output to output & procName & "${fd}" & wName & "${fd}" & wId & "${fd}" & (item 1 of wPos) & "${fd}" & (item 2 of wPos) & "${fd}" & (item 1 of wSize) & "${fd}" & (item 2 of wSize) & "${fd}" & wMin & "${rd}"
      end repeat
    end try
  end repeat
  return output
end tell`;
}

/**
 * Parse the delimited AppleScript output into WindowInfo objects.
 */
function parseWindowRecords(raw: string): WindowInfo[] {
  if (!raw || raw === "NOT_RUNNING") return [];

  const records = raw.split(RECORD_DELIMITER).filter((r) => r.length > 0);
  const windows: WindowInfo[] = [];

  for (const record of records) {
    const fields = record.split(FIELD_DELIMITER);
    if (fields.length < 8) continue;

    windows.push({
      app: fields[0],
      title: fields[1],
      id: parseInt(fields[2], 10) || 0,
      position: {
        x: parseInt(fields[3], 10) || 0,
        y: parseInt(fields[4], 10) || 0,
      },
      size: {
        w: parseInt(fields[5], 10) || 0,
        h: parseInt(fields[6], 10) || 0,
      },
      minimized: fields[7].trim().toLowerCase() === "true",
    });
  }

  return windows;
}

/**
 * Detect whether a name looks like a bundle identifier (contains dots).
 */
function isBundleId(name: string): boolean {
  return name.includes(".");
}

// -- Handlers ----------------------------------------------------------------

/** Handle list_windows tool call. */
async function handleListWindows(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = ListWindowsInputSchema.parse(args);
  const script = buildListWindowsScript(parsed.app);
  const raw = await runAppleScript(script);

  if (raw === "NOT_RUNNING") {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: `Application "${parsed.app}" is not running`,
            windows: [],
          }),
        },
      ],
    };
  }

  const windows = parseWindowRecords(raw);

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
