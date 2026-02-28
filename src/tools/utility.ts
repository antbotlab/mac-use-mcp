import { stat, unlink } from "node:fs/promises";
import { z } from "zod";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToToolInputSchema } from "../helpers/schema.js";
import { execFileAsync } from "../helpers/exec.js";
import { PERMISSION_CHECK_TIMEOUT_MS } from "../constants.js";

// -- Constants ---------------------------------------------------------------

/** AppleScript that succeeds only when Accessibility is granted. */
const ACCESSIBILITY_TEST_SCRIPT =
  'tell application "System Events" to return (exists process 1)';

/** Temporary file used to probe Screen Recording permission. */
const SCREEN_RECORDING_TEST_PATH = "/tmp/mac-use-mcp-permtest.png";

/** Maximum allowed wait duration (ms). */
const WAIT_MAX_MS = 10_000;

/** Default wait duration (ms). */
const WAIT_DEFAULT_MS = 500;

/** System Settings navigation instructions for missing permissions. */
const ACCESSIBILITY_INSTRUCTIONS =
  "System Settings > Privacy & Security > Accessibility — add this application";

const SCREEN_RECORDING_INSTRUCTIONS =
  "System Settings > Privacy & Security > Screen Recording — add this application";

// -- Schemas -----------------------------------------------------------------

const CheckPermissionsInputSchema = z.object({});

const WaitInputSchema = z.object({
  duration_ms: z
    .number()
    .int()
    .min(0)
    .max(WAIT_MAX_MS)
    .default(WAIT_DEFAULT_MS)
    .describe("Duration to wait in milliseconds (0–10000, default 500)"),
});

// -- Tool definitions --------------------------------------------------------

export const utilityToolDefinitions: Tool[] = [
  {
    name: "check_permissions",
    description:
      "Check whether macOS Accessibility and Screen Recording permissions are granted. Returns status for each permission and instructions for any that are missing.",
    inputSchema: zodToToolInputSchema(CheckPermissionsInputSchema),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  {
    name: "wait",
    description:
      "Pause execution for a specified duration. Useful for waiting between UI operations.",
    inputSchema: zodToToolInputSchema(WaitInputSchema),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
];

// -- Handlers ----------------------------------------------------------------

/**
 * Test whether Accessibility permission is granted by running a benign
 * AppleScript that requires System Events access.
 */
async function testAccessibility(): Promise<boolean> {
  try {
    await execFileAsync("osascript", ["-e", ACCESSIBILITY_TEST_SCRIPT], {
      timeout: PERMISSION_CHECK_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Test whether Screen Recording permission is granted by attempting a
 * silent screenshot and checking whether the output file has content.
 */
async function testScreenRecording(): Promise<boolean> {
  try {
    await execFileAsync("screencapture", ["-x", SCREEN_RECORDING_TEST_PATH], {
      timeout: PERMISSION_CHECK_TIMEOUT_MS,
    });

    const info = await stat(SCREEN_RECORDING_TEST_PATH);
    const granted = info.size > 0;

    // Clean up test file
    await unlink(SCREEN_RECORDING_TEST_PATH).catch(() => {
      /* ignore cleanup errors */
    });

    return granted;
  } catch {
    // Clean up on failure path as well
    await unlink(SCREEN_RECORDING_TEST_PATH).catch(() => {
      /* ignore */
    });
    return false;
  }
}

/** Handle check_permissions tool call. */
async function handleCheckPermissions(): Promise<CallToolResult> {
  const accessibility = await testAccessibility();
  const screenRecording = await testScreenRecording();

  const missing: string[] = [];
  if (!accessibility) missing.push(ACCESSIBILITY_INSTRUCTIONS);
  if (!screenRecording) missing.push(SCREEN_RECORDING_INSTRUCTIONS);

  const instructions =
    missing.length === 0
      ? "All permissions granted."
      : `Grant the following permissions:\n${missing.map((m) => `  - ${m}`).join("\n")}`;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(
          { accessibility, screenRecording, instructions },
          null,
          2,
        ),
      },
    ],
  };
}

/** Handle wait tool call. */
async function handleWait(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = WaitInputSchema.parse(args);
  const duration = parsed.duration_ms;

  await new Promise<void>((resolve) => {
    setTimeout(resolve, duration);
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ waited_ms: duration }),
      },
    ],
  };
}

// -- Dispatcher --------------------------------------------------------------

/** Map of utility tool names to their handler functions. */
export const utilityToolHandlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<CallToolResult>
> = {
  check_permissions: () => handleCheckPermissions(),
  wait: handleWait,
};
