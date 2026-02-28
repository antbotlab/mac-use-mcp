import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Timeout for AppleScript execution (ms). */
const COMMAND_TIMEOUT_MS = 15_000;

/**
 * Execute an AppleScript expression and return its result.
 *
 * Uses the native `osascript` command with the `-e` flag.
 * Parses osascript stderr to produce descriptive error messages.
 *
 * @param script - The AppleScript source code to execute.
 * @returns The stdout output from osascript, trimmed.
 * @throws An error with a descriptive message if execution fails.
 */
export async function runAppleScript(script: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: COMMAND_TIMEOUT_MS,
    });
    return stdout.trim();
  } catch (error: unknown) {
    const execError = error as {
      stderr?: string;
      code?: number | string;
      killed?: boolean;
      signal?: string;
    };

    if (execError.killed || execError.signal === "SIGTERM") {
      throw new Error(
        `AppleScript execution timed out after ${COMMAND_TIMEOUT_MS}ms`,
      );
    }

    const stderr = execError.stderr?.trim() ?? "";
    const errorMessage = stderr
      ? parseAppleScriptError(stderr)
      : `AppleScript execution failed with exit code ${execError.code ?? "unknown"}`;

    throw new Error(errorMessage);
  }
}

/**
 * Parse osascript stderr into a human-readable error message.
 *
 * osascript errors typically follow the format:
 *   <line>:<column>: <error type>: <message>
 * or:
 *   execution error: <message> (-<code>)
 *
 * @param stderr - Raw stderr output from osascript.
 * @returns A formatted error message.
 */
function parseAppleScriptError(stderr: string): string {
  // Match "execution error: <message> (-<code>)" pattern
  const executionErrorMatch = stderr.match(
    /execution error:\s*(.+?)\s*\((-?\d+)\)/,
  );
  if (executionErrorMatch) {
    return `AppleScript error (${executionErrorMatch[2]}): ${executionErrorMatch[1]}`;
  }

  // Match "<line>:<col>: <type>: <message>" pattern
  const syntaxErrorMatch = stderr.match(/(\d+):(\d+):\s*(\w[\w\s]*?):\s*(.+)/);
  if (syntaxErrorMatch) {
    return `AppleScript syntax error at line ${syntaxErrorMatch[1]}, column ${syntaxErrorMatch[2]}: ${syntaxErrorMatch[4]}`;
  }

  // Fall back to raw stderr
  return `AppleScript failed: ${stderr}`;
}
