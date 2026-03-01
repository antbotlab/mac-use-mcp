import { describe, it, expect } from "vitest";
import { z, ZodError } from "zod";

const WAIT_MAX_MS = 10_000;
const WAIT_DEFAULT_MS = 500;

const CheckPermissionsInputSchema = z.object({});

const WaitInputSchema = z.object({
  duration_ms: z
    .number()
    .int()
    .min(0)
    .max(WAIT_MAX_MS)
    .default(WAIT_DEFAULT_MS),
});

describe("check_permissions schema", () => {
  it("accepts empty object", () => {
    const result = CheckPermissionsInputSchema.parse({});
    expect(result).toEqual({});
  });
});

describe("wait schema", () => {
  it("uses default duration (500ms)", () => {
    const result = WaitInputSchema.parse({});
    expect(result.duration_ms).toBe(500);
  });

  it("accepts minimum duration (0)", () => {
    const result = WaitInputSchema.parse({ duration_ms: 0 });
    expect(result.duration_ms).toBe(0);
  });

  it("accepts maximum duration (10000)", () => {
    const result = WaitInputSchema.parse({ duration_ms: 10000 });
    expect(result.duration_ms).toBe(10000);
  });

  it("rejects negative duration", () => {
    expect(() => WaitInputSchema.parse({ duration_ms: -1 })).toThrow(ZodError);
  });

  it("rejects over maximum duration", () => {
    expect(() => WaitInputSchema.parse({ duration_ms: 10001 })).toThrow(
      ZodError,
    );
  });

  it("rejects float duration", () => {
    expect(() => WaitInputSchema.parse({ duration_ms: 1.5 })).toThrow(ZodError);
  });
});
