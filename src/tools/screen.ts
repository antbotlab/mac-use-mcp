import { runInputHelper } from "../helpers/input-helper.js";
import { enqueue } from "../queue.js";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// -- Types -------------------------------------------------------------------

/** Per-display information returned by the Swift helper. */
interface DisplayInfo {
  name: string;
  resolution: { width: number; height: number };
  origin: { x: number; y: number };
  scaleFactor: number;
}

// -- Tool definitions --------------------------------------------------------

export const screenToolDefinitions: Tool[] = [
  {
    name: "get_screen_info",
    description:
      "Retrieve display configuration: number of displays, per-display resolution, origin, and scale factor.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  {
    name: "get_cursor_position",
    description: "Get the current mouse cursor position in screen coordinates.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
];

// -- Handlers ----------------------------------------------------------------

/** Handle get_screen_info tool call. */
async function handleGetScreenInfo(): Promise<CallToolResult> {
  const response = await runInputHelper("display_info", {});
  const rawDisplays = response.displays as Array<{
    name: string;
    width: number;
    height: number;
    x: number;
    y: number;
    scaleFactor: number;
  }>;

  const displays: DisplayInfo[] = rawDisplays.map((d) => ({
    name: d.name,
    resolution: { width: d.width, height: d.height },
    origin: { x: d.x, y: d.y },
    scaleFactor: d.scaleFactor,
  }));

  const result = {
    displayCount: displays.length,
    displays,
  };

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

/** Handle get_cursor_position tool call. */
async function handleGetCursorPosition(): Promise<CallToolResult> {
  const response = await runInputHelper("cursor", {});
  const x = response.x as number;
  const y = response.y as number;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ x, y }),
      },
    ],
  };
}

// -- Dispatcher --------------------------------------------------------------

/** Map of screen tool names to their handler functions (queued). */
export const screenToolHandlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<CallToolResult>
> = {
  get_screen_info: () => enqueue(() => handleGetScreenInfo()),
  get_cursor_position: () => enqueue(() => handleGetCursorPosition()),
};
