import { describe, it, expect } from "vitest";
import { z, ZodError } from "zod";

// Must mirror src/tools/accessibility.ts
const GetUIElementsInputSchema = z.object({
  app: z.string().max(1_000).optional(),
  role: z.string().max(200).optional(),
  title: z.string().max(1_000).optional(),
  max_depth: z.number().int().min(1).max(10).default(5),
});

describe("get_ui_elements schema", () => {
  it("accepts empty object with defaults", () => {
    const result = GetUIElementsInputSchema.parse({});
    expect(result.max_depth).toBe(5);
    expect(result.app).toBeUndefined();
    expect(result.role).toBeUndefined();
    expect(result.title).toBeUndefined();
  });

  it("accepts all optional fields", () => {
    const result = GetUIElementsInputSchema.parse({
      app: "Calculator",
      role: "AXButton",
      title: "AC",
      max_depth: 3,
    });
    expect(result.app).toBe("Calculator");
    expect(result.role).toBe("AXButton");
    expect(result.title).toBe("AC");
    expect(result.max_depth).toBe(3);
  });

  it("accepts min max_depth (1)", () => {
    const result = GetUIElementsInputSchema.parse({ max_depth: 1 });
    expect(result.max_depth).toBe(1);
  });

  it("accepts max max_depth (10)", () => {
    const result = GetUIElementsInputSchema.parse({ max_depth: 10 });
    expect(result.max_depth).toBe(10);
  });

  it("rejects max_depth 0", () => {
    expect(() => GetUIElementsInputSchema.parse({ max_depth: 0 })).toThrow(
      ZodError,
    );
  });

  it("rejects max_depth 11", () => {
    expect(() => GetUIElementsInputSchema.parse({ max_depth: 11 })).toThrow(
      ZodError,
    );
  });

  it("rejects float max_depth", () => {
    expect(() => GetUIElementsInputSchema.parse({ max_depth: 3.5 })).toThrow(
      ZodError,
    );
  });

  it("rejects app exceeding max length (1000)", () => {
    expect(() =>
      GetUIElementsInputSchema.parse({ app: "a".repeat(1_001) }),
    ).toThrow(ZodError);
  });

  it("rejects role exceeding max length (200)", () => {
    expect(() =>
      GetUIElementsInputSchema.parse({ role: "a".repeat(201) }),
    ).toThrow(ZodError);
  });

  it("rejects title exceeding max length (1000)", () => {
    expect(() =>
      GetUIElementsInputSchema.parse({ title: "a".repeat(1_001) }),
    ).toThrow(ZodError);
  });
});
