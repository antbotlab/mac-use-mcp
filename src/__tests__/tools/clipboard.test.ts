import { describe, it, expect } from "vitest";
import { z, ZodError } from "zod";

const ClipboardReadInputSchema = z.object({});

const ClipboardWriteInputSchema = z.object({
  text: z.string().max(100_000),
});

describe("clipboard_read schema", () => {
  it("accepts empty object", () => {
    const result = ClipboardReadInputSchema.parse({});
    expect(result).toEqual({});
  });
});

describe("clipboard_write schema", () => {
  it("accepts text", () => {
    const result = ClipboardWriteInputSchema.parse({ text: "hello" });
    expect(result.text).toBe("hello");
  });

  it("accepts empty string", () => {
    const result = ClipboardWriteInputSchema.parse({ text: "" });
    expect(result.text).toBe("");
  });

  it("rejects missing text", () => {
    expect(() => ClipboardWriteInputSchema.parse({})).toThrow(ZodError);
  });

  it("rejects non-string text", () => {
    expect(() => ClipboardWriteInputSchema.parse({ text: 123 })).toThrow(
      ZodError,
    );
  });

  it("rejects text exceeding max length (100000)", () => {
    expect(() =>
      ClipboardWriteInputSchema.parse({ text: "a".repeat(100_001) }),
    ).toThrow(ZodError);
  });

  it("accepts text at max length (100000)", () => {
    const result = ClipboardWriteInputSchema.parse({
      text: "a".repeat(100_000),
    });
    expect(result.text).toHaveLength(100_000);
  });
});
