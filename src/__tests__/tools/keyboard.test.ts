import { describe, it, expect, vi, beforeEach } from "vitest";
import { z, ZodError } from "zod";
import { KEY_CODES } from "../../constants.js";

// Mock dependencies
vi.mock("../../helpers/exec.js", () => ({
  execFileAsync: vi.fn(),
}));

vi.mock("../../helpers/clipboard.js", () => ({
  clipboardRead: vi.fn(),
  clipboardWrite: vi.fn(),
}));

import { execFileAsync } from "../../helpers/exec.js";
import { keyboardToolHandlers } from "../../tools/keyboard.js";

const mockExecFileAsync = vi.mocked(execFileAsync);

// Re-create schemas for validation tests (must mirror src/tools/keyboard.ts)
const TypeTextInputSchema = z.object({
  text: z.string().min(1).max(100_000),
});

const PressKeyInputSchema = z.object({
  key: z.string().min(1).max(200),
});

describe("type_text schema", () => {
  it("accepts valid text", () => {
    const result = TypeTextInputSchema.parse({ text: "hello" });
    expect(result.text).toBe("hello");
  });

  it("accepts Unicode text", () => {
    const result = TypeTextInputSchema.parse({ text: "你好世界 🌍" });
    expect(result.text).toBe("你好世界 🌍");
  });

  it("rejects empty text", () => {
    expect(() => TypeTextInputSchema.parse({ text: "" })).toThrow(ZodError);
  });

  it("rejects missing text", () => {
    expect(() => TypeTextInputSchema.parse({})).toThrow(ZodError);
  });

  it("rejects text exceeding max length (100000)", () => {
    expect(() =>
      TypeTextInputSchema.parse({ text: "a".repeat(100_001) }),
    ).toThrow(ZodError);
  });

  it("accepts text at max length (100000)", () => {
    const result = TypeTextInputSchema.parse({ text: "a".repeat(100_000) });
    expect(result.text).toHaveLength(100_000);
  });
});

describe("press_key schema", () => {
  it("accepts valid key", () => {
    const result = PressKeyInputSchema.parse({ key: "Return" });
    expect(result.key).toBe("Return");
  });

  it("accepts key combo", () => {
    const result = PressKeyInputSchema.parse({ key: "cmd+c" });
    expect(result.key).toBe("cmd+c");
  });

  it("rejects empty key", () => {
    expect(() => PressKeyInputSchema.parse({ key: "" })).toThrow(ZodError);
  });

  it("rejects key exceeding max length (200)", () => {
    expect(() => PressKeyInputSchema.parse({ key: "a".repeat(201) })).toThrow(
      ZodError,
    );
  });

  it("accepts key at max length (200)", () => {
    const result = PressKeyInputSchema.parse({ key: "a".repeat(200) });
    expect(result.key).toHaveLength(200);
  });
});

describe("press_key handler", () => {
  const handler = keyboardToolHandlers.press_key;

  beforeEach(() => {
    vi.resetAllMocks();
    mockExecFileAsync.mockResolvedValue({ stdout: "", stderr: "" });
  });

  it("handles single key (Return)", async () => {
    const result = await handler({ key: "Return" });
    expect(result.isError).toBeUndefined();

    // Verify osascript was called with correct key code
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      "osascript",
      ["-e", expect.stringContaining(`key code ${KEY_CODES.Return}`)],
      expect.any(Object),
    );
  });

  it("handles modifier combo (cmd+c)", async () => {
    const result = await handler({ key: "cmd+c" });
    expect(result.isError).toBeUndefined();

    const call = mockExecFileAsync.mock.calls[0];
    const script = call?.[1]?.[1] as string;
    expect(script).toContain(`key code ${KEY_CODES.c}`);
    expect(script).toContain("command down");
  });

  it("handles multiple modifiers (ctrl+shift+F5)", async () => {
    const result = await handler({ key: "ctrl+shift+F5" });
    expect(result.isError).toBeUndefined();

    const call = mockExecFileAsync.mock.calls[0];
    const script = call?.[1]?.[1] as string;
    expect(script).toContain(`key code ${KEY_CODES.F5}`);
    expect(script).toContain("control down");
    expect(script).toContain("shift down");
  });

  it("returns error for unknown key", async () => {
    const result = await handler({ key: "UnknownKey" });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Unknown key name");
  });

  it("returns error for unknown modifier", async () => {
    const result = await handler({ key: "super+a" });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Unknown modifier");
  });

  it("resolves modifier aliases correctly", async () => {
    // alt → option
    await handler({ key: "alt+Tab" });
    const altCall = mockExecFileAsync.mock.calls[0];
    const altScript = altCall?.[1]?.[1] as string;
    expect(altScript).toContain("option down");

    vi.resetAllMocks();
    mockExecFileAsync.mockResolvedValue({ stdout: "", stderr: "" });

    // opt → option
    await handler({ key: "opt+Tab" });
    const optCall = mockExecFileAsync.mock.calls[0];
    const optScript = optCall?.[1]?.[1] as string;
    expect(optScript).toContain("option down");
  });

  it("is case-insensitive for key names", async () => {
    await handler({ key: "return" });
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      "osascript",
      ["-e", expect.stringContaining(`key code ${KEY_CODES.Return}`)],
      expect.any(Object),
    );
  });
});
