import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  escapeAppleScriptString,
  parseAppleScriptError,
  runAppleScript,
} from "../../helpers/applescript.js";

// Mock execFileAsync
vi.mock("../../helpers/exec.js", () => ({
  execFileAsync: vi.fn(),
}));

import { execFileAsync } from "../../helpers/exec.js";

const mockExecFileAsync = vi.mocked(execFileAsync);

/** Create an exec-style error with stderr, code, killed, signal fields. */
function makeExecError(
  message: string,
  fields: { stderr?: string; code?: number; killed?: boolean; signal?: string },
): Error {
  return Object.assign(new Error(message), fields) as Error;
}

describe("escapeAppleScriptString", () => {
  it("returns simple string unchanged", () => {
    expect(escapeAppleScriptString("hello")).toBe("hello");
  });

  it("escapes double quotes", () => {
    expect(escapeAppleScriptString('say "hello"')).toBe('say \\"hello\\"');
  });

  it("escapes backslashes", () => {
    expect(escapeAppleScriptString("path\\to\\file")).toBe(
      "path\\\\to\\\\file",
    );
  });

  it("escapes both backslashes and quotes (order matters)", () => {
    expect(escapeAppleScriptString('a\\"b')).toBe('a\\\\\\"b');
  });

  it("handles empty string", () => {
    expect(escapeAppleScriptString("")).toBe("");
  });

  it("handles string with only special characters", () => {
    expect(escapeAppleScriptString('""\\\\')).toBe('\\"\\"\\\\\\\\');
  });
});

describe("parseAppleScriptError", () => {
  it("parses execution error with code", () => {
    const stderr = 'execution error: Application "Foo" is not running (-600)';
    const result = parseAppleScriptError(stderr);
    expect(result).toBe(
      'AppleScript error (-600): Application "Foo" is not running',
    );
  });

  it("parses syntax error with line and column", () => {
    const stderr =
      "1:5: syntax error: Expected end of line but found something";
    const result = parseAppleScriptError(stderr);
    expect(result).toBe(
      "AppleScript syntax error at line 1, column 5: Expected end of line but found something",
    );
  });

  it("falls back to raw stderr for unrecognized format", () => {
    const stderr = "something went wrong";
    const result = parseAppleScriptError(stderr);
    expect(result).toBe("AppleScript failed: something went wrong");
  });

  it("handles execution error with negative code", () => {
    const stderr = "execution error: Some error occurred (-1728)";
    const result = parseAppleScriptError(stderr);
    expect(result).toContain("-1728");
  });
});

describe("runAppleScript", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("returns trimmed stdout on success", async () => {
    mockExecFileAsync.mockResolvedValue({
      stdout: "  result text  \n",
      stderr: "",
    });

    const result = await runAppleScript("some script");
    expect(result).toBe("result text");
    expect(mockExecFileAsync).toHaveBeenCalledWith(
      "osascript",
      ["-e", "some script"],
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("throws timeout error when killed by SIGTERM", async () => {
    mockExecFileAsync.mockRejectedValue(
      makeExecError("timeout", { killed: true, signal: "SIGTERM", stderr: "" }),
    );

    await expect(runAppleScript("slow script")).rejects.toThrow(/timed out/);
  });

  it("parses stderr into descriptive error", async () => {
    mockExecFileAsync.mockRejectedValue(
      makeExecError("exec failed", {
        stderr: "execution error: App not found (-600)",
        code: 1,
      }),
    );

    await expect(runAppleScript("bad script")).rejects.toThrow(
      /AppleScript error \(-600\)/,
    );
  });

  it("uses exit code when stderr is empty", async () => {
    mockExecFileAsync.mockRejectedValue(
      makeExecError("exec failed", { stderr: "", code: 1 }),
    );

    await expect(runAppleScript("bad script")).rejects.toThrow(/exit code 1/);
  });
});
