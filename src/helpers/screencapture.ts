import { readFile, unlink } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import {
  DEFAULT_MAX_DIMENSION,
  SCREENCAPTURE_TIMEOUT_MS,
} from "../constants.js";
import { execFileAsync } from "./exec.js";
import { runInputHelper } from "./input-helper.js";
import { ListWindowsResponseSchema } from "../tools/window.js";

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

/** Schema shape for the Swift input-helper screenshot response. */
interface SwiftScreenshotResponse {
  success: boolean;
  base64?: string;
  width: number;
  height: number;
  origin_x: number;
  origin_y: number;
  scale_x: number;
  scale_y: number;
  error?: string;
}

/**
 * Capture a screenshot via the built-in Swift input-helper (primary path).
 *
 * Falls back to the legacy screencapture CLI pipeline if the Swift binary
 * does not support the "screenshot" command (e.g. old binary version).
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

  try {
    return await captureViaInputHelper(
      mode,
      region,
      windowTitle,
      maxDimension,
      format,
    );
  } catch (error: unknown) {
    // If the error indicates the binary lacks the "screenshot" command,
    // fall back to the legacy screencapture CLI pipeline
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("unknown command")) {
      return captureViaScreencaptureCLI(
        mode,
        region,
        windowTitle,
        maxDimension,
        format,
      );
    }
    throw error;
  }
}

// -- Primary path: Swift input-helper ----------------------------------------

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
    const response = (await runInputHelper(
      "screenshot",
      helperArgs,
    )) as unknown as SwiftScreenshotResponse;

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

// -- Fallback path: screencapture CLI ----------------------------------------

/**
 * Resolve the macOS CGWindowID for a given window title using the Swift helper.
 *
 * Searches all windows for one whose title contains the specified text
 * (case-insensitive). Returns the real CGWindowID compatible with screencapture -l.
 *
 * @param windowTitle - Partial or full window title to search for.
 * @returns The numeric CGWindowID as a string.
 * @throws If no matching window is found.
 */
async function getWindowId(windowTitle: string): Promise<string> {
  const response = await runInputHelper("list_windows", {});
  const result = ListWindowsResponseSchema.parse(response);

  const titleLower = windowTitle.toLowerCase();
  const match = result.windows.find((w) =>
    w.title.toLowerCase().includes(titleLower),
  );

  if (!match) {
    throw new Error(`No window found matching: ${windowTitle}`);
  }

  return String(match.id);
}

/**
 * Query pixel dimensions of an image file using sips.
 *
 * @param filePath - Path to the image file.
 * @returns An object with width and height in pixels.
 */
async function getImageDimensions(
  filePath: string,
): Promise<{ width: number; height: number }> {
  const { stdout } = await execFileAsync(
    "sips",
    ["-g", "pixelWidth", "-g", "pixelHeight", filePath],
    { timeout: SCREENCAPTURE_TIMEOUT_MS },
  );

  const widthMatch = stdout.match(/pixelWidth:\s*(\d+)/);
  const heightMatch = stdout.match(/pixelHeight:\s*(\d+)/);

  if (!widthMatch || !heightMatch) {
    throw new Error(
      `Failed to parse image dimensions from sips output: ${stdout}`,
    );
  }

  return {
    width: parseInt(widthMatch[1], 10),
    height: parseInt(heightMatch[1], 10),
  };
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

/**
 * Legacy fallback: capture a screenshot using the macOS screencapture CLI.
 *
 * Used when the Swift input-helper binary does not support the "screenshot"
 * command (e.g. older binary version). This path spawns 3 child processes
 * (screencapture + sips + sips) and works in physical pixels.
 */
async function captureViaScreencaptureCLI(
  mode: CaptureMode,
  region: CaptureRegion | undefined,
  windowTitle: string | undefined,
  maxDimension: number,
  format: ImageFormat,
): Promise<ScreenshotResult> {
  const tmpPath = makeTmpPath(format);

  try {
    // Build screencapture arguments
    const args: string[] = ["-x", "-C"];

    if (format === "jpeg") {
      args.push("-t", "jpg");
    }

    switch (mode) {
      case "region": {
        if (!region) {
          throw new Error(
            'Region coordinates are required when mode is "region"',
          );
        }
        args.push("-R", `${region.x},${region.y},${region.w},${region.h}`);
        break;
      }
      case "window": {
        if (!windowTitle) {
          throw new Error('Window title is required when mode is "window"');
        }
        const windowId = await getWindowId(windowTitle);
        args.push("-l", windowId);
        break;
      }
      case "full":
        // No additional arguments needed for full-screen capture
        break;
      default:
        throw new Error(`Unknown capture mode: ${mode as string}`);
    }

    args.push(tmpPath);

    // Capture the screenshot
    await execFileAsync("screencapture", args, {
      timeout: SCREENCAPTURE_TIMEOUT_MS,
    });

    // Get original dimensions (physical pixels)
    const originalDims = await getImageDimensions(tmpPath);

    // Resize to fit within maxDimension (only if maxDimension > 0)
    if (maxDimension > 0) {
      await execFileAsync("sips", ["-Z", String(maxDimension), tmpPath], {
        timeout: SCREENCAPTURE_TIMEOUT_MS,
      });
    }

    // Get final dimensions
    const finalDims = await getImageDimensions(tmpPath);

    // Read file and encode to base64
    const buffer = await readFile(tmpPath);
    const base64 = buffer.toString("base64");

    // In the legacy path, compute approximate scale factors.
    // screencapture outputs physical pixels, so coordinates are approximate.
    const scaleX =
      finalDims.width !== originalDims.width
        ? originalDims.width / finalDims.width
        : 1;
    const scaleY =
      finalDims.height !== originalDims.height
        ? originalDims.height / finalDims.height
        : 1;

    return {
      base64,
      width: finalDims.width,
      height: finalDims.height,
      originX: 0,
      originY: 0,
      scaleX,
      scaleY,
    };
  } finally {
    // Clean up temporary file
    await unlink(tmpPath).catch(() => {
      // Ignore cleanup errors — file may not exist if capture failed early
    });
  }
}
