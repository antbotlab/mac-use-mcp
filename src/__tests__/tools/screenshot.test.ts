import { describe, it, expect } from "vitest";
import { z, ZodError } from "zod";
import { DEFAULT_MAX_DIMENSION } from "../../constants.js";

// Re-create the schemas locally to test validation without importing handlers.
// This mirrors the exact definitions in src/tools/screenshot.ts.

const MIN_MAX_DIMENSION = 256;
const MAX_MAX_DIMENSION = 4096;

const ScreenshotBaseSchema = z.object({
  mode: z.enum(["full", "region", "window"]).default("full"),
  x: z.number().int().optional(),
  y: z.number().int().optional(),
  width: z.number().int().min(1).optional(),
  height: z.number().int().min(1).optional(),
  window_title: z.string().min(1).max(1_000).optional(),
  max_dimension: z
    .number()
    .int()
    .min(0)
    .max(MAX_MAX_DIMENSION)
    .default(DEFAULT_MAX_DIMENSION)
    .refine((v) => v === 0 || v >= MIN_MAX_DIMENSION, {
      message: `max_dimension must be 0 (no resize) or between ${MIN_MAX_DIMENSION} and ${MAX_MAX_DIMENSION}`,
    }),
  format: z.enum(["png", "jpeg"]).default("png"),
});

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

describe("screenshot schema validation", () => {
  it("accepts full mode with defaults", () => {
    const result = ScreenshotInputSchema.parse({});
    expect(result.mode).toBe("full");
    expect(result.max_dimension).toBe(0);
    expect(result.format).toBe("png");
  });

  it("accepts full mode with explicit values", () => {
    const result = ScreenshotInputSchema.parse({
      mode: "full",
      max_dimension: 1024,
      format: "jpeg",
    });
    expect(result.mode).toBe("full");
    expect(result.max_dimension).toBe(1024);
    expect(result.format).toBe("jpeg");
  });

  it("accepts region mode with all required fields", () => {
    const result = ScreenshotInputSchema.parse({
      mode: "region",
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    });
    expect(result.mode).toBe("region");
    expect(result.x).toBe(0);
  });

  it("rejects region mode without coordinates", () => {
    expect(() => ScreenshotInputSchema.parse({ mode: "region" })).toThrow(
      ZodError,
    );
  });

  it("rejects region mode with partial coordinates", () => {
    expect(() =>
      ScreenshotInputSchema.parse({ mode: "region", x: 0, y: 0 }),
    ).toThrow(ZodError);
  });

  it("accepts window mode with title", () => {
    const result = ScreenshotInputSchema.parse({
      mode: "window",
      window_title: "Safari",
    });
    expect(result.mode).toBe("window");
    expect(result.window_title).toBe("Safari");
  });

  it("rejects window mode without title", () => {
    expect(() => ScreenshotInputSchema.parse({ mode: "window" })).toThrow(
      ZodError,
    );
  });

  it("rejects window_title exceeding max length (1000)", () => {
    expect(() =>
      ScreenshotInputSchema.parse({
        mode: "window",
        window_title: "a".repeat(1_001),
      }),
    ).toThrow(ZodError);
  });

  it("rejects max_dimension between 1 and 255", () => {
    expect(() => ScreenshotInputSchema.parse({ max_dimension: 100 })).toThrow(
      ZodError,
    );
  });

  it("accepts max_dimension=0 (no resize)", () => {
    const result = ScreenshotInputSchema.parse({ max_dimension: 0 });
    expect(result.max_dimension).toBe(0);
  });

  it("accepts max_dimension=256 (minimum when non-zero)", () => {
    const result = ScreenshotInputSchema.parse({ max_dimension: 256 });
    expect(result.max_dimension).toBe(256);
  });

  it("accepts max_dimension=4096 (maximum)", () => {
    const result = ScreenshotInputSchema.parse({ max_dimension: 4096 });
    expect(result.max_dimension).toBe(4096);
  });

  it("rejects max_dimension=4097 (over maximum)", () => {
    expect(() => ScreenshotInputSchema.parse({ max_dimension: 4097 })).toThrow(
      ZodError,
    );
  });

  it("rejects invalid mode", () => {
    expect(() => ScreenshotInputSchema.parse({ mode: "invalid" })).toThrow(
      ZodError,
    );
  });

  it("rejects invalid format", () => {
    expect(() => ScreenshotInputSchema.parse({ format: "gif" })).toThrow(
      ZodError,
    );
  });

  it("accepts negative coordinates for secondary displays", () => {
    const result = ScreenshotInputSchema.parse({
      mode: "region",
      x: -326,
      y: -1080,
      width: 100,
      height: 100,
    });
    expect(result.x).toBe(-326);
    expect(result.y).toBe(-1080);
  });

  it("rejects zero-sized region", () => {
    expect(() =>
      ScreenshotInputSchema.parse({
        mode: "region",
        x: 0,
        y: 0,
        width: 0,
        height: 100,
      }),
    ).toThrow(ZodError);
  });
});
