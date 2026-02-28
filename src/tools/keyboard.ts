import { z } from "zod";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToToolInputSchema } from "../helpers/schema.js";
import { runInputHelper } from "../helpers/input-helper.js";
import { enqueue } from "../queue.js";
import { KEY_CODES, MODIFIER_FLAGS } from "../constants.js";

// -- Constants ---------------------------------------------------------------

/** Modifier name aliases mapped to canonical MODIFIER_FLAGS keys. */
const MODIFIER_ALIASES: Record<string, keyof typeof MODIFIER_FLAGS> = {
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

// -- Schemas -----------------------------------------------------------------

/** Maximum delay between keystrokes in milliseconds (1 second). */
const TYPE_DELAY_MAX_MS = 1_000;

const TypeTextInputSchema = z.object({
  text: z.string().min(1).describe("Text to type. Supports full Unicode including CJK and emoji."),
  delay_ms: z
    .number()
    .int()
    .min(0)
    .max(TYPE_DELAY_MAX_MS)
    .optional()
    .describe("Delay between keystrokes in milliseconds (default 0)."),
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
      "Type text at the current cursor position using CGEvent key synthesis. Supports full Unicode including CJK characters and emoji. If secure input is active (e.g. password fields), returns a note suggesting clipboard_write + press_key(\"cmd+v\") as an alternative.",
    inputSchema: zodToToolInputSchema(TypeTextInputSchema),
  },
  {
    name: "press_key",
    description:
      'Simulate a key press with optional modifiers using CGEvent. Accepts a key combo string like "cmd+c", "ctrl+shift+F5", or "Return". Modifiers: cmd, ctrl, shift, opt/alt.',
    inputSchema: zodToToolInputSchema(PressKeyInputSchema),
  },
];

// -- Handlers ----------------------------------------------------------------

/** Handle type_text tool call. */
async function handleTypeText(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = TypeTextInputSchema.parse(args);

  // Check if secure input is active before typing
  const secureStatus = await runInputHelper("secure", {});
  const secureActive = secureStatus.secure === true;

  if (secureActive) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: false,
              secureInputActive: true,
              note: "Secure input is active (e.g. a password field is focused). CGEvent-based typing is blocked. Use clipboard_write to place text on the clipboard, then press_key(\"cmd+v\") to paste instead.",
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  await runInputHelper("type", {
    text: parsed.text,
    delay: parsed.delay_ms ?? 0,
  });

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

/** Handle press_key tool call. */
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

  // Build combined modifier flags
  let modifiers = 0;
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
    modifiers |= MODIFIER_FLAGS[canonical];
  }

  await runInputHelper("key", { code, modifiers });

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
