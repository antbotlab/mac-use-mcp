import { z } from "zod";
import { runInputHelper } from "../helpers/input-helper.js";
import { enqueue } from "../queue.js";
import type { Tool, CallToolResult } from "@modelcontextprotocol/sdk/types.js";

// -- Constants ---------------------------------------------------------------

/** Mouse buttons accepted by the click tool. */
const MOUSE_BUTTONS = ["left", "right", "middle"] as const;

/** Scroll directions accepted by the scroll tool. */
const SCROLL_DIRECTIONS = ["up", "down", "left", "right"] as const;

/** Modifier keys that can be held during a click. */
const CLICK_MODIFIERS = ["command", "shift", "option", "control"] as const;

/** Default scroll amount in discrete steps. */
const SCROLL_DEFAULT_AMOUNT = 3;

/** Default drag duration in milliseconds. */
const DRAG_DEFAULT_DURATION_MS = 500;

// -- Schemas -----------------------------------------------------------------

const ClickInputSchema = z.object({
  x: z.number().int().nonnegative().describe("X coordinate (non-negative integer)"),
  y: z.number().int().nonnegative().describe("Y coordinate (non-negative integer)"),
  button: z
    .enum(MOUSE_BUTTONS)
    .default("left")
    .describe("Mouse button to click (default: left)"),
  click_count: z
    .union([z.literal(1), z.literal(2), z.literal(3)])
    .default(1)
    .describe("Number of clicks: 1 (single), 2 (double), or 3 (triple)"),
  modifiers: z
    .array(z.enum(CLICK_MODIFIERS))
    .optional()
    .describe("Modifier keys to hold during click"),
});

const MoveMouseInputSchema = z.object({
  x: z.number().int().nonnegative().describe("X coordinate (non-negative integer)"),
  y: z.number().int().nonnegative().describe("Y coordinate (non-negative integer)"),
});

const ScrollInputSchema = z.object({
  x: z.number().int().nonnegative().describe("X coordinate (non-negative integer)"),
  y: z.number().int().nonnegative().describe("Y coordinate (non-negative integer)"),
  direction: z
    .enum(SCROLL_DIRECTIONS)
    .describe("Scroll direction"),
  amount: z
    .number()
    .int()
    .positive()
    .default(SCROLL_DEFAULT_AMOUNT)
    .describe(`Scroll amount in discrete steps (default: ${SCROLL_DEFAULT_AMOUNT})`),
});

const DragInputSchema = z.object({
  start_x: z.number().int().nonnegative().describe("Start X coordinate (non-negative integer)"),
  start_y: z.number().int().nonnegative().describe("Start Y coordinate (non-negative integer)"),
  end_x: z.number().int().nonnegative().describe("End X coordinate (non-negative integer)"),
  end_y: z.number().int().nonnegative().describe("End Y coordinate (non-negative integer)"),
  duration_ms: z
    .number()
    .int()
    .positive()
    .default(DRAG_DEFAULT_DURATION_MS)
    .describe(`Drag duration in milliseconds (default: ${DRAG_DEFAULT_DURATION_MS})`),
});

// -- Tool definitions --------------------------------------------------------

export const mouseToolDefinitions: Tool[] = [
  {
    name: "click",
    description:
      "Click at the specified screen coordinates. Supports left/right/middle button, single/double/triple click, and modifier keys.",
    inputSchema: {
      type: "object" as const,
      properties: {
        x: { type: "number", description: "X coordinate (non-negative integer)" },
        y: { type: "number", description: "Y coordinate (non-negative integer)" },
        button: {
          type: "string",
          enum: [...MOUSE_BUTTONS],
          description: "Mouse button to click (default: left)",
          default: "left",
        },
        click_count: {
          type: "number",
          enum: [1, 2, 3],
          description: "Number of clicks: 1 (single), 2 (double), or 3 (triple)",
          default: 1,
        },
        modifiers: {
          type: "array",
          items: { type: "string", enum: [...CLICK_MODIFIERS] },
          description: "Modifier keys to hold during click",
        },
      },
      required: ["x", "y"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
    },
  },
  {
    name: "move_mouse",
    description: "Move the mouse cursor to the specified screen coordinates without clicking.",
    inputSchema: {
      type: "object" as const,
      properties: {
        x: { type: "number", description: "X coordinate (non-negative integer)" },
        y: { type: "number", description: "Y coordinate (non-negative integer)" },
      },
      required: ["x", "y"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "scroll",
    description:
      "Scroll at the specified screen coordinates in the given direction.",
    inputSchema: {
      type: "object" as const,
      properties: {
        x: { type: "number", description: "X coordinate (non-negative integer)" },
        y: { type: "number", description: "Y coordinate (non-negative integer)" },
        direction: {
          type: "string",
          enum: [...SCROLL_DIRECTIONS],
          description: "Scroll direction",
        },
        amount: {
          type: "number",
          description: `Scroll amount in discrete steps (default: ${SCROLL_DEFAULT_AMOUNT})`,
          default: SCROLL_DEFAULT_AMOUNT,
        },
      },
      required: ["x", "y", "direction"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
    },
  },
  {
    name: "drag",
    description:
      "Drag from one screen coordinate to another over a specified duration.",
    inputSchema: {
      type: "object" as const,
      properties: {
        start_x: { type: "number", description: "Start X coordinate (non-negative integer)" },
        start_y: { type: "number", description: "Start Y coordinate (non-negative integer)" },
        end_x: { type: "number", description: "End X coordinate (non-negative integer)" },
        end_y: { type: "number", description: "End Y coordinate (non-negative integer)" },
        duration_ms: {
          type: "number",
          description: `Drag duration in milliseconds (default: ${DRAG_DEFAULT_DURATION_MS})`,
          default: DRAG_DEFAULT_DURATION_MS,
        },
      },
      required: ["start_x", "start_y", "end_x", "end_y"],
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
    },
  },
];

// -- Handlers ----------------------------------------------------------------

/** Handle click tool call. */
async function handleClick(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = ClickInputSchema.parse(args);

  await runInputHelper("click", {
    x: parsed.x,
    y: parsed.y,
    button: parsed.button,
    count: parsed.click_count,
    ...(parsed.modifiers && parsed.modifiers.length > 0
      ? { modifiers: parsed.modifiers }
      : {}),
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          clicked: { x: parsed.x, y: parsed.y },
          button: parsed.button,
          click_count: parsed.click_count,
          modifiers: parsed.modifiers ?? [],
        }),
      },
    ],
  };
}

/** Handle move_mouse tool call. */
async function handleMoveMouse(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = MoveMouseInputSchema.parse(args);

  await runInputHelper("move", { x: parsed.x, y: parsed.y });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ moved_to: { x: parsed.x, y: parsed.y } }),
      },
    ],
  };
}

/**
 * Convert a direction and amount into dx, dy scroll deltas.
 *
 * Positive dy = scroll up (content moves down), negative dy = scroll down.
 * Positive dx = scroll left (content moves right), negative dx = scroll right.
 */
function scrollDirectionToDeltas(
  direction: (typeof SCROLL_DIRECTIONS)[number],
  amount: number,
): { dx: number; dy: number } {
  switch (direction) {
    case "up":
      return { dx: 0, dy: amount };
    case "down":
      return { dx: 0, dy: -amount };
    case "left":
      return { dx: amount, dy: 0 };
    case "right":
      return { dx: -amount, dy: 0 };
  }
}

/** Handle scroll tool call. */
async function handleScroll(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = ScrollInputSchema.parse(args);
  const { dx, dy } = scrollDirectionToDeltas(parsed.direction, parsed.amount);

  await runInputHelper("scroll", {
    x: parsed.x,
    y: parsed.y,
    dx,
    dy,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          scrolled_at: { x: parsed.x, y: parsed.y },
          direction: parsed.direction,
          amount: parsed.amount,
        }),
      },
    ],
  };
}

/** Handle drag tool call. */
async function handleDrag(
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const parsed = DragInputSchema.parse(args);

  await runInputHelper("drag", {
    sx: parsed.start_x,
    sy: parsed.start_y,
    ex: parsed.end_x,
    ey: parsed.end_y,
    duration: parsed.duration_ms,
  });

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          dragged: {
            from: { x: parsed.start_x, y: parsed.start_y },
            to: { x: parsed.end_x, y: parsed.end_y },
          },
          duration_ms: parsed.duration_ms,
        }),
      },
    ],
  };
}

// -- Dispatcher --------------------------------------------------------------

/** Map of mouse tool names to their handler functions (queued). */
export const mouseToolHandlers: Record<
  string,
  (args: Record<string, unknown>) => Promise<CallToolResult>
> = {
  click: (args) => enqueue(() => handleClick(args)),
  move_mouse: (args) => enqueue(() => handleMoveMouse(args)),
  scroll: (args) => enqueue(() => handleScroll(args)),
  drag: (args) => enqueue(() => handleDrag(args)),
};
