import { z } from "zod";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToToolInputSchema } from "../helpers/schema.js";
import { clipboardRead, clipboardWrite } from "../helpers/clipboard.js";
import { execFileAsync } from "../helpers/exec.js";
import { enqueue } from "../queue.js";
import { KEY_CODES, APPLESCRIPT_TIMEOUT_MS } from "../constants.js";

// -- Constants ---------------------------------------------------------------

/** Modifier name aliases mapped to canonical names. */
const MODIFIER_ALIASES: Record<string, string> = {
  cmd: "command",
  command: "command",
  ctrl: "control",
  control: "control",
  shift: "shift",
  opt: "option",
  alt: "option",
  option: "option",
};

/** Build a case-insensitive lookup map from KEY_CODES. */
const KEY_CODES_LOWER: Record<string, number> = Object.fromEntries(
  Object.entries(KEY_CODES).map(([name, code]) => [name.toLowerCase(), code]),
);

/** Representative sample of valid key names for error messages. */
const KEY_NAME_EXAMPLES = [
  "a-z",
  "0-9",
  "F1-F20",
  "Return",
  "Tab",
  "Space",
  "Delete",
  "Escape",
  "UpArrow",
  "DownArrow",
  "LeftArrow",
  "RightArrow",
  "Home",
  "End",
  "PageUp",
  "PageDown",
];

/** Delay after paste before restoring clipboard (ms). */
const PASTE_SETTLE_MS = 50;

// -- Schemas -----------------------------------------------------------------

const TypeTextInputSchema = z.object({
  text: z
    .string()
    .min(1)
    .describe("Text to type. Supports full Unicode including CJK and emoji."),
});

const PressKeyInputSchema = z.object({
  key: z
    .string()
    .min(1)
    .describe(
      'Key combo string. Examples: "Return", "cmd+c", "ctrl+shift+F5", "alt+Tab".',
    ),
});

// -- Tool definitions --------------------------------------------------------

export const keyboardToolDefinitions: Tool[] = [
  {
    name: "type_text",
    description:
      'Type text at the current cursor position using clipboard paste. Supports full Unicode including CJK characters and emoji. If secure input is active (e.g. password fields), returns a note suggesting clipboard_write + press_key("cmd+v") as an alternative.',
    inputSchema: zodToToolInputSchema(TypeTextInputSchema),
  },
  {
    name: "press_key",
    description:
      'Simulate a key press with optional modifiers. Accepts a key combo string like "cmd+c", "ctrl+shift+F5", or "Return". Modifiers: cmd, ctrl, shift, opt/alt.',
    inputSchema: zodToToolInputSchema(PressKeyInputSchema),
  },
];

// -- Handlers ----------------------------------------------------------------

/**
 * Handle type_text tool call.
 *
 * Uses clipboard paste (save → write → Cmd+V → restore) instead of CGEvent
 * key synthesis, which is silently blocked on macOS 26+.
 */
async function handleTypeText(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = TypeTextInputSchema.parse(args);

  // Save current clipboard contents (best-effort)
  let oldClipboard = "";
  try {
    oldClipboard = await clipboardRead();
  } catch {
    // Clipboard may be empty or contain non-text data
  }

  // Write target text to clipboard
  await clipboardWrite(parsed.text);

  // Paste via AppleScript Cmd+V
  await execFileAsync(
    "osascript",
    ["-e", 'tell application "System Events" to key code 9 using command down'],
    { timeout: APPLESCRIPT_TIMEOUT_MS },
  );

  // Brief delay for paste to settle before restoring clipboard
  await new Promise((resolve) => setTimeout(resolve, PASTE_SETTLE_MS));

  // Restore previous clipboard contents (best-effort)
  try {
    await clipboardWrite(oldClipboard);
  } catch {
    // Best-effort restore
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          typed: parsed.text,
        }),
      },
    ],
  };
}

/**
 * Handle press_key tool call.
 *
 * Uses AppleScript `key code` via System Events instead of CGEvent,
 * which is silently blocked for keyboard events on macOS 26+.
 */
async function handlePressKey(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = PressKeyInputSchema.parse(args);

  const parts = parsed.key.split("+");
  const baseKeyName = parts[parts.length - 1];
  const modifierNames = parts.slice(0, -1);

  // Look up the base key code (case-insensitive)
  const code = KEY_CODES_LOWER[baseKeyName.toLowerCase()];
  if (code === undefined) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: `Unknown key name: "${baseKeyName}". Valid key names include: ${KEY_NAME_EXAMPLES.join(", ")}`,
        },
      ],
    };
  }

  // Build AppleScript modifier clause
  const asModifiers: string[] = [];
  for (const mod of modifierNames) {
    const canonical = MODIFIER_ALIASES[mod.toLowerCase()];
    if (canonical === undefined) {
      return {
        isError: true,
        content: [
          {
            type: "text" as const,
            text: `Unknown modifier: "${mod}". Valid modifiers: cmd, ctrl, shift, opt (or alt).`,
          },
        ],
      };
    }
    asModifiers.push(`${canonical} down`);
  }

  // Build and execute AppleScript
  const script =
    asModifiers.length > 0
      ? `tell application "System Events" to key code ${code} using {${asModifiers.join(", ")}}`
      : `tell application "System Events" to key code ${code}`;

  await execFileAsync("osascript", ["-e", script], {
    timeout: APPLESCRIPT_TIMEOUT_MS,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          key: parsed.key,
        }),
      },
    ],
  };
}

// -- Dispatcher --------------------------------------------------------------

/** Map of keyboard tool names to their handler functions (queued). */
export const keyboardToolHandlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<CallToolResult>
> = {
  type_text: (args) => enqueue(() => handleTypeText(args)),
  press_key: (args) => enqueue(() => handlePressKey(args)),
};
