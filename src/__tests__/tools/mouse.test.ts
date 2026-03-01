import { describe, it, expect } from "vitest";
import { z, ZodError } from "zod";
import { scrollDirectionToDeltas } from "../../tools/mouse.js";

// Re-create schemas to test validation

const MOUSE_BUTTONS = ["left", "right", "middle"] as const;
const SCROLL_DIRECTIONS = ["up", "down", "left", "right"] as const;
const CLICK_MODIFIERS = ["command", "shift", "option", "control"] as const;

const ClickInputSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  button: z.enum(MOUSE_BUTTONS).default("left"),
  click_count: z.number().int().min(1).max(3).default(1),
  modifiers: z.array(z.enum(CLICK_MODIFIERS)).optional(),
});

const MoveMouseInputSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
});

const ScrollInputSchema = z.object({
  x: z.number().int(),
  y: z.number().int(),
  direction: z.enum(SCROLL_DIRECTIONS),
  amount: z.number().int().positive().max(100).default(3),
});

const DragInputSchema = z.object({
  start_x: z.number().int(),
  start_y: z.number().int(),
  end_x: z.number().int(),
  end_y: z.number().int(),
  duration_ms: z.number().int().positive().max(30_000).default(600),
});

describe("click schema", () => {
  it("accepts minimal input with defaults", () => {
    const result = ClickInputSchema.parse({ x: 100, y: 200 });
    expect(result.button).toBe("left");
    expect(result.click_count).toBe(1);
    expect(result.modifiers).toBeUndefined();
  });

  it("accepts all button types", () => {
    for (const button of MOUSE_BUTTONS) {
      const result = ClickInputSchema.parse({ x: 0, y: 0, button });
      expect(result.button).toBe(button);
    }
  });

  it("accepts click count 1-3", () => {
    for (const count of [1, 2, 3]) {
      const result = ClickInputSchema.parse({
        x: 0,
        y: 0,
        click_count: count,
      });
      expect(result.click_count).toBe(count);
    }
  });

  it("rejects click count 0", () => {
    expect(() =>
      ClickInputSchema.parse({ x: 0, y: 0, click_count: 0 }),
    ).toThrow(ZodError);
  });

  it("rejects click count 4", () => {
    expect(() =>
      ClickInputSchema.parse({ x: 0, y: 0, click_count: 4 }),
    ).toThrow(ZodError);
  });

  it("accepts negative coordinates for secondary displays", () => {
    const result = ClickInputSchema.parse({ x: -100, y: -500 });
    expect(result.x).toBe(-100);
    expect(result.y).toBe(-500);
  });

  it("rejects invalid button", () => {
    expect(() =>
      ClickInputSchema.parse({ x: 0, y: 0, button: "extra" }),
    ).toThrow(ZodError);
  });

  it("accepts modifiers", () => {
    const result = ClickInputSchema.parse({
      x: 0,
      y: 0,
      modifiers: ["command", "shift"],
    });
    expect(result.modifiers).toEqual(["command", "shift"]);
  });

  it("rejects invalid modifier", () => {
    expect(() =>
      ClickInputSchema.parse({ x: 0, y: 0, modifiers: ["super"] }),
    ).toThrow(ZodError);
  });

  it("rejects float coordinates", () => {
    expect(() => ClickInputSchema.parse({ x: 1.5, y: 0 })).toThrow(ZodError);
  });
});

describe("move_mouse schema", () => {
  it("accepts valid coordinates", () => {
    const result = MoveMouseInputSchema.parse({ x: 500, y: 300 });
    expect(result).toEqual({ x: 500, y: 300 });
  });

  it("rejects missing fields", () => {
    expect(() => MoveMouseInputSchema.parse({ x: 0 })).toThrow(ZodError);
    expect(() => MoveMouseInputSchema.parse({ y: 0 })).toThrow(ZodError);
    expect(() => MoveMouseInputSchema.parse({})).toThrow(ZodError);
  });
});

describe("scroll schema", () => {
  it("accepts valid input with defaults", () => {
    const result = ScrollInputSchema.parse({
      x: 0,
      y: 0,
      direction: "down",
    });
    expect(result.amount).toBe(3);
  });

  it("accepts all directions", () => {
    for (const direction of SCROLL_DIRECTIONS) {
      const result = ScrollInputSchema.parse({ x: 0, y: 0, direction });
      expect(result.direction).toBe(direction);
    }
  });

  it("rejects invalid direction", () => {
    expect(() =>
      ScrollInputSchema.parse({ x: 0, y: 0, direction: "diagonal" }),
    ).toThrow(ZodError);
  });

  it("rejects zero amount", () => {
    expect(() =>
      ScrollInputSchema.parse({ x: 0, y: 0, direction: "up", amount: 0 }),
    ).toThrow(ZodError);
  });

  it("rejects amount over 100", () => {
    expect(() =>
      ScrollInputSchema.parse({ x: 0, y: 0, direction: "up", amount: 101 }),
    ).toThrow(ZodError);
  });
});

describe("drag schema", () => {
  it("accepts valid input with default duration", () => {
    const result = DragInputSchema.parse({
      start_x: 0,
      start_y: 0,
      end_x: 100,
      end_y: 100,
    });
    expect(result.duration_ms).toBe(600);
  });

  it("rejects zero duration", () => {
    expect(() =>
      DragInputSchema.parse({
        start_x: 0,
        start_y: 0,
        end_x: 100,
        end_y: 100,
        duration_ms: 0,
      }),
    ).toThrow(ZodError);
  });

  it("rejects duration over 30000", () => {
    expect(() =>
      DragInputSchema.parse({
        start_x: 0,
        start_y: 0,
        end_x: 100,
        end_y: 100,
        duration_ms: 30001,
      }),
    ).toThrow(ZodError);
  });
});

describe("scrollDirectionToDeltas", () => {
  it("up → positive dy", () => {
    expect(scrollDirectionToDeltas("up", 5)).toEqual({ dx: 0, dy: 5 });
  });

  it("down → negative dy", () => {
    expect(scrollDirectionToDeltas("down", 3)).toEqual({ dx: 0, dy: -3 });
  });

  it("left → positive dx", () => {
    expect(scrollDirectionToDeltas("left", 2)).toEqual({ dx: 2, dy: 0 });
  });

  it("right → negative dx", () => {
    expect(scrollDirectionToDeltas("right", 4)).toEqual({ dx: -4, dy: 0 });
  });
});
