import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runInputHelper } from "../helpers/input-helper.js";
import { enqueue } from "../queue.js";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

const execFileAsync = promisify(execFile);

// -- Constants ---------------------------------------------------------------

/** Timeout for system_profiler command (ms). */
const SYSTEM_PROFILER_TIMEOUT_MS = 10_000;

// -- Types -------------------------------------------------------------------

/** Per-display information extracted from system_profiler output. */
interface DisplayInfo {
  name: string;
  resolution: { width: number; height: number };
  origin: { x: number; y: number };
  scaleFactor: number;
}

/** system_profiler SPDisplaysDataType JSON structure (relevant fields). */
interface SPDisplaysDataType {
  SPDisplaysDataType: Array<{
    sppci_model?: string;
    _name?: string;
    spdisplays_ndrvs?: Array<{
      _name?: string;
      _spdisplays_resolution?: string;
      _spdisplays_pixels?: string;
      spdisplays_resolution?: string;
      _spdisplays_displayOrigin?: string;
    }>;
  }>;
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

/**
 * Parse resolution string from system_profiler into width, height, and scale.
 *
 * Common formats:
 *   "1920 x 1080"
 *   "3024 x 1964 Retina"
 *   "2560 x 1440 @ 2.00x"
 */
function parseResolution(raw: string): {
  width: number;
  height: number;
  retina: boolean;
} {
  const match = raw.match(/(\d+)\s*x\s*(\d+)/);
  if (!match) {
    return { width: 0, height: 0, retina: false };
  }
  const retina =
    /retina/i.test(raw) || /@\s*2/i.test(raw);
  return {
    width: parseInt(match[1], 10),
    height: parseInt(match[2], 10),
    retina,
  };
}

/**
 * Parse origin string like "(0, 0)" into x, y coordinates.
 */
function parseOrigin(raw: string | undefined): { x: number; y: number } {
  if (!raw) return { x: 0, y: 0 };
  const match = raw.match(/\(?\s*(-?\d+)\s*,\s*(-?\d+)\s*\)?/);
  if (!match) return { x: 0, y: 0 };
  return { x: parseInt(match[1], 10), y: parseInt(match[2], 10) };
}

/** Handle get_screen_info tool call. */
async function handleGetScreenInfo(): Promise<CallToolResult> {
  const { stdout } = await execFileAsync(
    "system_profiler",
    ["SPDisplaysDataType", "-json"],
    { timeout: SYSTEM_PROFILER_TIMEOUT_MS },
  );

  const data = JSON.parse(stdout) as SPDisplaysDataType;
  const displays: DisplayInfo[] = [];

  for (const gpu of data.SPDisplaysDataType) {
    const screens = gpu.spdisplays_ndrvs ?? [];
    for (const screen of screens) {
      const resString =
        screen._spdisplays_pixels ??
        screen._spdisplays_resolution ??
        screen.spdisplays_resolution ??
        "";
      const { width, height, retina } = parseResolution(resString);
      const origin = parseOrigin(screen._spdisplays_displayOrigin);

      displays.push({
        name: screen._name ?? "Unknown Display",
        resolution: { width, height },
        origin,
        scaleFactor: retina ? 2 : 1,
      });
    }
  }

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
