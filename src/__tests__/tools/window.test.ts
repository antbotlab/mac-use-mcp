import { describe, it, expect } from "vitest";
import { z, ZodError } from "zod";
import { isBundleId, ListWindowsResponseSchema } from "../../tools/window.js";

// Re-create schemas for validation tests (must mirror src/tools/window.ts)
const ListWindowsInputSchema = z.object({
  app: z.string().max(1_000).optional(),
});

const FocusWindowInputSchema = z.object({
  app: z.string().max(1_000),
  title: z.string().max(1_000).optional(),
});

const OpenApplicationInputSchema = z.object({
  name: z.string().max(1_000),
});

describe("list_windows schema", () => {
  it("accepts empty object", () => {
    const result = ListWindowsInputSchema.parse({});
    expect(result.app).toBeUndefined();
  });

  it("accepts app filter", () => {
    const result = ListWindowsInputSchema.parse({ app: "Safari" });
    expect(result.app).toBe("Safari");
  });

  it("rejects app exceeding max length (1000)", () => {
    expect(() =>
      ListWindowsInputSchema.parse({ app: "a".repeat(1_001) }),
    ).toThrow(ZodError);
  });
});

describe("focus_window schema", () => {
  it("accepts app without title", () => {
    const result = FocusWindowInputSchema.parse({ app: "Safari" });
    expect(result.title).toBeUndefined();
  });

  it("accepts app with title", () => {
    const result = FocusWindowInputSchema.parse({
      app: "Safari",
      title: "Google",
    });
    expect(result.title).toBe("Google");
  });

  it("rejects missing app", () => {
    expect(() => FocusWindowInputSchema.parse({})).toThrow(ZodError);
  });

  it("rejects app exceeding max length (1000)", () => {
    expect(() =>
      FocusWindowInputSchema.parse({ app: "a".repeat(1_001) }),
    ).toThrow(ZodError);
  });

  it("rejects title exceeding max length (1000)", () => {
    expect(() =>
      FocusWindowInputSchema.parse({
        app: "Safari",
        title: "a".repeat(1_001),
      }),
    ).toThrow(ZodError);
  });
});

describe("open_application schema", () => {
  it("accepts name", () => {
    const result = OpenApplicationInputSchema.parse({ name: "Safari" });
    expect(result.name).toBe("Safari");
  });

  it("rejects missing name", () => {
    expect(() => OpenApplicationInputSchema.parse({})).toThrow(ZodError);
  });

  it("rejects name exceeding max length (1000)", () => {
    expect(() =>
      OpenApplicationInputSchema.parse({ name: "a".repeat(1_001) }),
    ).toThrow(ZodError);
  });
});

describe("isBundleId", () => {
  it("recognizes valid bundle IDs", () => {
    expect(isBundleId("com.apple.Safari")).toBe(true);
    expect(isBundleId("com.apple.driver.Apple_HDA")).toBe(true);
    expect(isBundleId("com.chenyuliu.MyApp")).toBe(true);
    expect(isBundleId("org.mozilla.firefox")).toBe(true);
  });

  it("rejects too few segments", () => {
    expect(isBundleId("com.apple")).toBe(false);
    expect(isBundleId("Safari")).toBe(false);
  });

  it("rejects segment starting with number", () => {
    expect(isBundleId("com.1apple.Safari")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isBundleId("")).toBe(false);
  });

  it("rejects plain app names", () => {
    expect(isBundleId("Safari")).toBe(false);
    expect(isBundleId("Google Chrome")).toBe(false);
  });
});

describe("ListWindowsResponseSchema", () => {
  it("accepts valid response", () => {
    const response = {
      success: true,
      windows: [
        {
          app: "Finder",
          title: "Desktop",
          id: 123,
          x: 0,
          y: 25,
          width: 800,
          height: 600,
          minimized: false,
        },
      ],
    };
    const result = ListWindowsResponseSchema.parse(response);
    expect(result.windows).toHaveLength(1);
    expect(result.windows[0].app).toBe("Finder");
  });

  it("accepts empty window list", () => {
    const result = ListWindowsResponseSchema.parse({
      success: true,
      windows: [],
    });
    expect(result.windows).toHaveLength(0);
  });

  it("rejects missing required fields in window entry", () => {
    expect(() =>
      ListWindowsResponseSchema.parse({
        success: true,
        windows: [{ app: "Finder" }],
      }),
    ).toThrow(ZodError);
  });

  it("rejects missing success field", () => {
    expect(() => ListWindowsResponseSchema.parse({ windows: [] })).toThrow(
      ZodError,
    );
  });
});
