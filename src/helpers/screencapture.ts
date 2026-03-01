import { readFile, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { DEFAULT_MAX_DIMENSION } from "../constants.js";
import { runInputHelper } from "./input-helper.js";

/** Prefix for temporary screenshot files. */
const TMPFILE_PREFIX = "/tmp/mac-use-mcp-";

/** Capture mode for screencapture. */
export type CaptureMode = "full" | "region" | "window";

/** Image format for screencapture output. */
export type ImageFormat = "png" | "jpeg";

/** Region coordinates for region-mode capture. */
export interface CaptureRegion {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Options for captureScreen. */
export interface CaptureOptions {
  /** Capture mode: full screen, a region, or a specific window. Defaults to "full". */
  mode?: CaptureMode;
  /** Region coordinates. Required when mode is "region". */
  region?: CaptureRegion;
  /** Window title to capture. Required when mode is "window". */
  windowTitle?: string;
  /** Maximum dimension (width or height) for resizing. 0 means no resize. Defaults to 0. */
  maxDimension?: number;
  /** Output image format. Defaults to "png". */
  format?: ImageFormat;
}

/** Result of a screen capture operation. */
export interface ScreenshotResult {
  /** Base64-encoded image data. */
  base64: string;
  /** Width of the final image in pixels. */
  width: number;
  /** Height of the final image in pixels. */
  height: number;
  /** Screen coordinate of image pixel (0,0) — X. */
  originX: number;
  /** Screen coordinate of image pixel (0,0) — Y. */
  originY: number;
  /** Multiply factor: image_x to screen offset. */
  scaleX: number;
  /** Multiply factor: image_y to screen offset. */
  scaleY: number;
}

/** Zod schema for validating the Swift input-helper screenshot response. */
const SwiftScreenshotResponseSchema = z.object({
  success: z.boolean(),
  base64: z.string().optional(),
  width: z.number(),
  height: z.number(),
  origin_x: z.number(),
  origin_y: z.number(),
  scale_x: z.number(),
  scale_y: z.number(),
  error: z.string().optional(),
});

/**
 * Capture a screenshot via the built-in Swift input-helper.
 *
 * @param options - Capture configuration. Defaults to full-screen PNG, no resize.
 * @returns Screenshot data including base64 content, dimensions, and coordinate mapping.
 */
export async function captureScreen(
  options: CaptureOptions = {},
): Promise<ScreenshotResult> {
  const {
    mode = "full",
    region,
    windowTitle,
    maxDimension = DEFAULT_MAX_DIMENSION,
    format = "png",
  } = options;

  return captureViaInputHelper(mode, region, windowTitle, maxDimension, format);
}

/**
 * Capture via the Swift input-helper "screenshot" command.
 *
 * Uses CGWindowListCreateImage at logical resolution (no .bestResolution),
 * with built-in resize and PNG/JPEG encoding.
 */
async function captureViaInputHelper(
  mode: CaptureMode,
  region: CaptureRegion | undefined,
  windowTitle: string | undefined,
  maxDimension: number,
  format: ImageFormat,
): Promise<ScreenshotResult> {
  const tmpPath = makeTmpPath(format);

  const helperArgs: Record<string, unknown> = {
    mode,
    max_dimension: maxDimension,
    format,
    output_path: tmpPath,
  };

  if (mode === "region" && region) {
    helperArgs.x = region.x;
    helperArgs.y = region.y;
    helperArgs.w = region.w;
    helperArgs.h = region.h;
  }

  if (mode === "window" && windowTitle) {
    helperArgs.window_title = windowTitle;
  }

  try {
    const response = SwiftScreenshotResponseSchema.parse(
      await runInputHelper("screenshot", helperArgs),
    );

    if (!response.success) {
      throw new Error(response.error ?? "Screenshot capture failed");
    }

    const buffer = await readFile(tmpPath);
    const base64 = buffer.toString("base64");

    return {
      base64,
      width: response.width,
      height: response.height,
      originX: response.origin_x,
      originY: response.origin_y,
      scaleX: response.scale_x,
      scaleY: response.scale_y,
    };
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
}

/**
 * Generate a unique temporary file path for a screenshot.
 *
 * @param format - Image format extension.
 * @returns Absolute path to a temporary file.
 */
function makeTmpPath(format: ImageFormat): string {
  const id = randomBytes(8).toString("hex");
  return `${TMPFILE_PREFIX}${id}.${format}`;
}
