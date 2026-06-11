import { access, chmod } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { ERROR_MESSAGES, INPUT_HELPER_TIMEOUT_MS } from "../constants.js";
import { execFileAsync } from "./exec.js";

/** Path to the compiled Swift input-helper binary. */
const BINARY_PATH = new URL("../../dist/bin/input-helper", import.meta.url)
  .pathname;

/**
 * Verify the Swift helper is present and executable, recovering when possible.
 *
 * npm pack normalizes file modes from the registry index, so prebuilt binaries
 * shipped under `files[]` can lose their +x bit on publish even though the
 * source tarball had it. This function distinguishes "missing" from "present
 * but not executable" and attempts a single `chmod 0o755` self-heal for the
 * latter case before falling back to a structured error.
 */
async function ensureBinaryExecutable(): Promise<void> {
  try {
    await access(BINARY_PATH, fsConstants.X_OK);
    return;
  } catch {
    // X_OK failed — distinguish "file missing" from "file not executable".
    try {
      await access(BINARY_PATH, fsConstants.F_OK);
    } catch (fError) {
      throw new Error(
        `${ERROR_MESSAGES.BINARY_NOT_FOUND}\n  path: ${BINARY_PATH}`,
        { cause: fError },
      );
    }

    // File exists, just not executable — attempt self-heal.
    try {
      await chmod(BINARY_PATH, 0o755);
      await access(BINARY_PATH, fsConstants.X_OK);
    } catch (healError) {
      throw new Error(
        `${ERROR_MESSAGES.BINARY_NOT_EXECUTABLE}\n  path: ${BINARY_PATH}`,
        { cause: healError },
      );
    }
  }
}

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
  | "display_info"
  | "list_windows"
  | "screenshot"
  | "get_ui_elements";

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
  await ensureBinaryExecutable();

  try {
    const { stdout } = await execFileAsync(
      BINARY_PATH,
      [command, JSON.stringify(args)],
      { timeout: INPUT_HELPER_TIMEOUT_MS },
    );

    return JSON.parse(stdout) as Record<string, unknown>;
  } catch (error: unknown) {
    const execError = error as {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
      signal?: string;
    };

    if (execError.killed || execError.signal === "SIGTERM") {
      throw new Error(ERROR_MESSAGES.TIMEOUT, { cause: error });
    }

    // Re-throw JSON parse errors as-is
    if (error instanceof SyntaxError) {
      throw new Error(`Input helper returned invalid JSON: ${error.message}`, {
        cause: error,
      });
    }

    // Swift fail() writes {"success":false,"error":"..."} to stdout before exit(1).
    // Parse it to surface the actual error message.
    const stdout = execError.stdout?.trim() ?? "";
    if (stdout) {
      try {
        const parsed = JSON.parse(stdout) as Record<string, unknown>;
        if (typeof parsed.error === "string") {
          throw new Error(parsed.error, { cause: error });
        }
      } catch (parseErr) {
        // Re-throw if it's our structured error; otherwise fall through
        if (parseErr instanceof Error && parseErr.cause === error) {
          throw parseErr;
        }
      }
    }

    const stderr = execError.stderr?.trim() ?? "";
    throw new Error(
      stderr ||
        `Input helper failed with exit code ${execError.code ?? "unknown"}`,
      { cause: error },
    );
  }
}
