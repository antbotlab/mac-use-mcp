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
  /** Maximum dimension (width or height) for resizing. Defaults to 1024. */
  maxDimension?: number;
  /** Output image format. Defaults to "png". */
  format?: ImageFormat;
  /** Display scale factor (e.g. 2 for Retina). Defaults to 1. */
  displayScaleFactor?: number;
}

/** Result of a screen capture operation. */
export interface ScreenshotResult {
  /** Base64-encoded image data. */
  base64: string;
  /** Width of the final image in pixels. */
  width: number;
  /** Height of the final image in pixels. */
  height: number;
  /** Description of the scaling applied. */
  scaleInfo: string;
  /** Logical screen width in points (physical pixels / scaleFactor). */
  screenWidth: number;
  /** Logical screen height in points (physical pixels / scaleFactor). */
  screenHeight: number;
}

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
 * Capture a screenshot of the macOS screen using the native screencapture CLI.
 *
 * Supports full screen, rectangular region, and single-window capture modes.
 * The captured image is resized to fit within maxDimension, encoded as base64,
 * and the temporary file is cleaned up before returning.
 *
 * @param options - Capture configuration. Defaults to full-screen PNG at 1024px max.
 * @returns Screenshot data including base64 content and dimensions.
 * @throws If screencapture fails, the window is not found, or image processing errors occur.
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
    displayScaleFactor = 1,
  } = options;

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

    // Get original dimensions (physical pixels) before resizing
    const originalDims = await getImageDimensions(tmpPath);

    // Compute logical dimensions (same coordinate system as CGEvent)
    const logicalWidth = Math.round(originalDims.width / displayScaleFactor);
    const logicalHeight = Math.round(originalDims.height / displayScaleFactor);

    // Resize to fit within maxDimension
    await execFileAsync("sips", ["-Z", String(maxDimension), tmpPath], {
      timeout: SCREENCAPTURE_TIMEOUT_MS,
    });

    // Get final dimensions after resizing
    const finalDims = await getImageDimensions(tmpPath);

    const scaleInfo =
      logicalWidth === finalDims.width && logicalHeight === finalDims.height
        ? `No resize needed (${finalDims.width}x${finalDims.height})`
        : `Resized from ${logicalWidth}x${logicalHeight} to ${finalDims.width}x${finalDims.height}`;

    // Read file and encode to base64
    const buffer = await readFile(tmpPath);
    const base64 = buffer.toString("base64");

    return {
      base64,
      width: finalDims.width,
      height: finalDims.height,
      scaleInfo,
      screenWidth: logicalWidth,
      screenHeight: logicalHeight,
    };
  } finally {
    // Clean up temporary file
    await unlink(tmpPath).catch(() => {
      // Ignore cleanup errors — file may not exist if capture failed early
    });
  }
}
