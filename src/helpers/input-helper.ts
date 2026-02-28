import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { ERROR_MESSAGES } from "../constants.js";

const execFileAsync = promisify(execFile);

/** Timeout for Swift helper binary execution (ms). */
const COMMAND_TIMEOUT_MS = 5_000;

/** Path to the compiled Swift input-helper binary. */
const BINARY_PATH = new URL("../../dist/bin/input-helper", import.meta.url)
  .pathname;

/** Commands accepted by the Swift input-helper binary. */
export type InputCommand =
  | "click"
  | "type"
  | "key"
  | "move"
  | "scroll"
  | "drag"
  | "cursor"
  | "secure"
  | "display_info";

/**
 * Execute the Swift input-helper binary with the given command and arguments.
 *
 * The binary receives the command name as the first positional argument and a
 * JSON-encoded argument object as the second. It returns a JSON object on
 * stdout.
 *
 * @param command - The input-helper subcommand to invoke.
 * @param args - Key-value arguments forwarded to the binary as JSON.
 * @returns The parsed JSON response from the binary.
 * @throws If the binary is missing, times out, or returns invalid output.
 */
export async function runInputHelper(
  command: InputCommand,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  // Verify the binary exists before attempting execution
  try {
    await access(BINARY_PATH, fsConstants.X_OK);
  } catch {
    throw new Error(ERROR_MESSAGES.BINARY_NOT_FOUND);
  }

  try {
    const { stdout } = await execFileAsync(
      BINARY_PATH,
      [command, JSON.stringify(args)],
      { timeout: COMMAND_TIMEOUT_MS },
    );

    return JSON.parse(stdout) as Record<string, unknown>;
  } catch (error: unknown) {
    const execError = error as {
      stderr?: string;
      code?: number | string;
      killed?: boolean;
      signal?: string;
    };

    if (execError.killed || execError.signal === "SIGTERM") {
      throw new Error(ERROR_MESSAGES.TIMEOUT);
    }

    // Re-throw JSON parse errors as-is
    if (error instanceof SyntaxError) {
      throw new Error(`Input helper returned invalid JSON: ${error.message}`);
    }

    const stderr = execError.stderr?.trim() ?? "";
    throw new Error(
      stderr || `Input helper failed with exit code ${execError.code ?? "unknown"}`,
    );
  }
}
