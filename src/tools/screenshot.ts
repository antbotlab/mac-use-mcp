import { z } from "zod";
import { captureScreen } from "../helpers/screencapture.js";
import { zodToToolInputSchema } from "../helpers/schema.js";
import { DEFAULT_MAX_DIMENSION } from "../constants.js";
import { enqueue } from "../queue.js";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// -- Constants ---------------------------------------------------------------

/** Minimum allowed value for max_dimension (when non-zero). */
const MIN_MAX_DIMENSION = 256;

/** Maximum allowed value for max_dimension. */
const MAX_MAX_DIMENSION = 4096;

/** Permission setup instructions shown when screenshot capture fails. */
const PERMISSION_INSTRUCTIONS =
  "Screen Recording permission is required. " +
  "Grant it in: System Settings > Privacy & Security > Screen Recording — add this application. " +
  "You may need to restart the application after granting permission.";

// -- Schemas -----------------------------------------------------------------

/** Base object schema for screenshot input (used for JSON Schema generation). */
const ScreenshotBaseSchema = z.object({
  mode: z
    .enum(["full", "region", "window"])
    .default("full")
    .describe(
      'Capture mode: "full" (entire screen), "region" (rectangular area), or "window" (specific window)',
    ),
  x: z
    .number()
    .int()
    .optional()
    .describe(
      "Left edge x-coordinate in screen pixels (may be negative for secondary displays; required when mode is region)",
    ),
  y: z
    .number()
    .int()
    .optional()
    .describe(
      "Top edge y-coordinate in screen pixels (may be negative for secondary displays; required when mode is region)",
    ),
  width: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Region width in screen pixels (required when mode is region)"),
  height: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("Region height in screen pixels (required when mode is region)"),
  window_title: z
    .string()
    .min(1)
    .max(1_000)
    .optional()
    .describe("Window title to capture (required when mode is window)"),
  max_dimension: z
    .number()
    .int()
    .min(0)
    .max(MAX_MAX_DIMENSION)
    .default(DEFAULT_MAX_DIMENSION)
    .refine((v) => v === 0 || v >= MIN_MAX_DIMENSION, {
      message: `max_dimension must be 0 (no resize) or between ${MIN_MAX_DIMENSION} and ${MAX_MAX_DIMENSION}`,
    })
    .describe(
      `Maximum width or height of the returned image. 0 means no resize (default). When set, must be ${MIN_MAX_DIMENSION}–${MAX_MAX_DIMENSION}.`,
    ),
  format: z
    .enum(["png", "jpeg"])
    .default("png")
    .describe('Output image format: "png" (default) or "jpeg"'),
  ruler: z
    .boolean()
    .default(false)
    .describe(
      "When true, overlay coordinate rulers on the top and left edges of the screenshot. Tick labels show screen coordinates for precise positioning.",
    ),
});

/** Full runtime validation schema with cross-field refinements. */
const ScreenshotInputSchema = ScreenshotBaseSchema.refine(
  (data) => {
    if (data.mode === "region") {
      return (
        data.x !== undefined &&
        data.y !== undefined &&
        data.width !== undefined &&
        data.height !== undefined
      );
    }
    return true;
  },
  { message: 'x, y, width, and height are required when mode is "region"' },
).refine(
  (data) => {
    if (data.mode === "window") {
      return data.window_title !== undefined;
    }
    return true;
  },
  { message: 'window_title is required when mode is "window"' },
);

// -- Tool definitions --------------------------------------------------------

export const screenshotToolDefinitions: Tool[] = [
  {
    name: "screenshot",
    description:
      "Capture a screenshot of the macOS screen. Supports full screen, a rectangular region, or a specific window by title. Returns a base64-encoded image with dimension metadata. Do not narrate visual observations or coordinate calculations. Brief task progress updates are acceptable.",
    inputSchema: zodToToolInputSchema(ScreenshotBaseSchema),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
];

// -- Handlers ----------------------------------------------------------------

/** Handle screenshot tool call. */
async function handleScreenshot(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = ScreenshotInputSchema.parse(args);

  try {
    const result = await captureScreen({
      mode: parsed.mode,
      region:
        parsed.mode === "region"
          ? { x: parsed.x!, y: parsed.y!, w: parsed.width!, h: parsed.height! }
          : undefined,
      windowTitle: parsed.mode === "window" ? parsed.window_title : undefined,
      maxDimension: parsed.max_dimension,
      format: parsed.format,
      ruler: parsed.ruler,
    });

    const mimeType = parsed.format === "jpeg" ? "image/jpeg" : "image/png";

    // Build coordinate mapping hint for agents
    const isIdentity =
      result.scaleX === 1 &&
      result.scaleY === 1 &&
      result.originX === 0 &&
      result.originY === 0;

    const coordinateHint = isIdentity
      ? "Coordinate mapping: screen = image pixel (1:1, no conversion needed)"
      : `Coordinate mapping: screen_x = ${result.originX} + image_x * ${result.scaleX}, screen_y = ${result.originY} + image_y * ${result.scaleY}`;

    return {
      content: [
        {
          type: "image" as const,
          data: result.base64,
          mimeType,
        },
        {
          type: "text" as const,
          text: `Image: ${result.width}x${result.height}\n${coordinateHint}`,
        },
      ],
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    // Detect permission-related failures and include setup instructions
    const isPermissionError =
      /permission/i.test(message) ||
      /not permitted/i.test(message) ||
      /screen recording/i.test(message) ||
      /cannot be opened/i.test(message);

    const text = isPermissionError
      ? `Screenshot failed: ${message}\n\n${PERMISSION_INSTRUCTIONS}`
      : `Screenshot failed: ${message}`;

    return {
      content: [{ type: "text" as const, text }],
      isError: true,
    };
  }
}

// -- Dispatcher --------------------------------------------------------------

/** Map of screenshot tool names to their handler functions (queued). */
export const screenshotToolHandlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<CallToolResult>
> = {
  screenshot: (args) => enqueue(() => handleScreenshot(args)),
};
