import { describe, it, expect, vi, beforeEach } from "vitest";
import { ERROR_MESSAGES } from "../../constants.js";

// Mock dependencies
vi.mock("../../helpers/exec.js", () => ({
  execFileAsync: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
}));

import { execFileAsync } from "../../helpers/exec.js";
import { access } from "node:fs/promises";
import { runInputHelper } from "../../helpers/input-helper.js";

const mockExecFileAsync = vi.mocked(execFileAsync);
const mockAccess = vi.mocked(access);

/** Create an exec-style error with stdout, stderr, code, killed, signal fields. */
function makeExecError(
  message: string,
  fields: {
    stdout?: string;
    stderr?: string;
    code?: number;
    killed?: boolean;
    signal?: string;
  },
): Error {
  return Object.assign(new Error(message), fields) as Error;
}

describe("runInputHelper", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // By default, the binary exists
    mockAccess.mockResolvedValue(undefined);
  });

  it("throws BINARY_NOT_FOUND when binary is missing", async () => {
    mockAccess.mockRejectedValue(new Error("ENOENT"));

    await expect(runInputHelper("click", { x: 0, y: 0 })).rejects.toThrow(
      ERROR_MESSAGES.BINARY_NOT_FOUND,
    );
  });

  it("returns parsed JSON on success", async () => {
    const response = { success: true, x: 100, y: 200 };
    mockExecFileAsync.mockResolvedValue({
      stdout: JSON.stringify(response),
      stderr: "",
    });

    const result = await runInputHelper("cursor", {});
    expect(result).toEqual(response);
  });

  it("passes command and JSON args to binary", async () => {
    mockExecFileAsync.mockResolvedValue({
      stdout: '{"success": true}',
      stderr: "",
    });

    await runInputHelper("click", { x: 10, y: 20 });

    expect(mockExecFileAsync).toHaveBeenCalledWith(
      expect.stringContaining("input-helper"),
      ["click", '{"x":10,"y":20}'],
      expect.objectContaining({ timeout: expect.any(Number) }),
    );
  });

  it("throws TIMEOUT when killed by SIGTERM", async () => {
    mockExecFileAsync.mockRejectedValue(
      makeExecError("killed", { killed: true, signal: "SIGTERM", stderr: "" }),
    );

    await expect(runInputHelper("click", {})).rejects.toThrow(
      ERROR_MESSAGES.TIMEOUT,
    );
  });

  it("throws descriptive error on invalid JSON response", async () => {
    mockExecFileAsync.mockResolvedValue({
      stdout: "not json at all",
      stderr: "",
    });

    await expect(runInputHelper("cursor", {})).rejects.toThrow(/invalid JSON/);
  });

  it("forwards stderr as error message", async () => {
    mockExecFileAsync.mockRejectedValue(
      makeExecError("exec failed", {
        stderr: "Permission denied for accessibility",
        code: 1,
      }),
    );

    await expect(runInputHelper("click", {})).rejects.toThrow(
      /Permission denied for accessibility/,
    );
  });

  it("uses exit code when stderr is empty", async () => {
    mockExecFileAsync.mockRejectedValue(
      makeExecError("exec failed", { stderr: "", code: 42 }),
    );

    await expect(runInputHelper("click", {})).rejects.toThrow(/exit code 42/);
  });

  // -- Tests for stdout JSON error propagation (Step 5) ----------------------

  it("propagates error message from stdout JSON on non-zero exit", async () => {
    mockExecFileAsync.mockRejectedValue(
      makeExecError("Command failed", {
        stdout:
          '{"success":false,"error":"no window found matching \'foo\'"}',
        stderr: "",
        code: 1,
      }),
    );

    await expect(runInputHelper("screenshot", {})).rejects.toThrow(
      "no window found matching 'foo'",
    );
  });

  it("falls back to exit code when stdout is not valid JSON", async () => {
    mockExecFileAsync.mockRejectedValue(
      makeExecError("Command failed", {
        stdout: "not json",
        stderr: "",
        code: 1,
      }),
    );

    await expect(runInputHelper("screenshot", {})).rejects.toThrow(
      "Input helper failed with exit code 1",
    );
  });

  it("prefers stdout JSON error over stderr", async () => {
    mockExecFileAsync.mockRejectedValue(
      makeExecError("Command failed", {
        stdout: '{"success":false,"error":"specific swift error"}',
        stderr: "generic stderr noise",
        code: 1,
      }),
    );

    await expect(runInputHelper("screenshot", {})).rejects.toThrow(
      "specific swift error",
    );
  });
});
