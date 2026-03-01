import { describe, it, expect, vi, beforeEach } from "vitest";
import { runInputHelper } from "../../helpers/input-helper.js";

// Mock the exec helper
vi.mock("../../helpers/exec.js", () => ({
  execFileAsync: vi.fn(),
}));

// Mock fs access check (binary existence)
vi.mock("node:fs/promises", () => ({
  access: vi.fn().mockResolvedValue(undefined),
}));

import { execFileAsync } from "../../helpers/exec.js";

const mockExecFileAsync = vi.mocked(execFileAsync);

describe("runInputHelper", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("propagates error message from stdout JSON on non-zero exit", async () => {
    const execError = Object.assign(new Error("Command failed"), {
      stdout: '{"success":false,"error":"no window found matching \'foo\'"}',
      stderr: "",
      code: 1,
      killed: false,
      signal: null,
    });
    mockExecFileAsync.mockRejectedValueOnce(execError);

    await expect(runInputHelper("screenshot", {})).rejects.toThrow(
      "no window found matching 'foo'",
    );
  });

  it("falls back to generic message when stdout has no error field", async () => {
    const execError = Object.assign(new Error("Command failed"), {
      stdout: "not json",
      stderr: "",
      code: 1,
      killed: false,
      signal: null,
    });
    mockExecFileAsync.mockRejectedValueOnce(execError);

    await expect(runInputHelper("screenshot", {})).rejects.toThrow(
      "Input helper failed with exit code 1",
    );
  });

  it("uses stderr when available", async () => {
    const execError = Object.assign(new Error("Command failed"), {
      stdout: "",
      stderr: "some stderr message",
      code: 1,
      killed: false,
      signal: null,
    });
    mockExecFileAsync.mockRejectedValueOnce(execError);

    await expect(runInputHelper("screenshot", {})).rejects.toThrow(
      "some stderr message",
    );
  });
});
