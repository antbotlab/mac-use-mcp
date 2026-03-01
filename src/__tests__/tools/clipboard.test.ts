import { describe, it, expect } from "vitest";
import { z, ZodError } from "zod";

const ClipboardReadInputSchema = z.object({});

const ClipboardWriteInputSchema = z.object({
  text: z.string(),
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
});
