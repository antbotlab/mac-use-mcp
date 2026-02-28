import { z } from "zod";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { zodToToolInputSchema } from "../helpers/schema.js";
import { clipboardRead, clipboardWrite } from "../helpers/clipboard.js";

// -- Schemas -----------------------------------------------------------------

const ClipboardReadInputSchema = z.object({});

const ClipboardWriteInputSchema = z.object({
  text: z.string().describe("Text to write to the clipboard."),
});

// -- Tool definitions --------------------------------------------------------

export const clipboardToolDefinitions: Tool[] = [
  {
    name: "clipboard_read",
    description:
      "Read the current contents of the macOS clipboard as plain text.",
    inputSchema: zodToToolInputSchema(ClipboardReadInputSchema),
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
    },
  },
  {
    name: "clipboard_write",
    description: "Write text to the macOS clipboard.",
    inputSchema: zodToToolInputSchema(ClipboardWriteInputSchema),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
];

// -- Handlers ----------------------------------------------------------------

/** Handle clipboard_read tool call. */
async function handleClipboardRead(): Promise<CallToolResult> {
  const text = await clipboardRead();

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ text }),
      },
    ],
  };
}

/** Handle clipboard_write tool call. */
async function handleClipboardWrite(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = ClipboardWriteInputSchema.parse(args);
  await clipboardWrite(parsed.text);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          length: parsed.text.length,
        }),
      },
    ],
  };
}

// -- Dispatcher --------------------------------------------------------------

/** Map of clipboard tool names to their handler functions. */
export const clipboardToolHandlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<CallToolResult>
> = {
  clipboard_read: () => handleClipboardRead(),
  clipboard_write: handleClipboardWrite,
};
