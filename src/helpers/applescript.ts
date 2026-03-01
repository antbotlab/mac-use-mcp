import { execFileAsync } from "./exec.js";
import { APPLESCRIPT_TIMEOUT_MS } from "../constants.js";

/**
 * Escape a string for safe interpolation inside AppleScript double-quoted literals.
 *
 * First strips all C0 control characters (U+0000–U+001F) and DEL (U+007F) — AppleScript
 * has no escape syntax for these in double-quoted strings. Then escapes backslashes
 * and double quotes (order matters).
 *
 * Unicode above U+007F is safe (AppleScript handles UTF-8 natively).
 *
 * @param str - The raw string to escape.
 * @returns The escaped string safe for use inside AppleScript `"..."`.
 */
/** Matches C0 control characters (U+0000–U+001F) and DEL (U+007F). */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1f\x7f]/g;

export function escapeAppleScriptString(str: string): string {
  return str
    .replace(CONTROL_CHARS_RE, "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

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
      timeout: APPLESCRIPT_TIMEOUT_MS,
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
        `AppleScript execution timed out after ${APPLESCRIPT_TIMEOUT_MS}ms`,
        { cause: error },
      );
    }

    const stderr = execError.stderr?.trim() ?? "";
    const errorMessage = stderr
      ? parseAppleScriptError(stderr)
      : `AppleScript execution failed with exit code ${execError.code ?? "unknown"}`;

    throw new Error(errorMessage, { cause: error });
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
export function parseAppleScriptError(stderr: string): string {
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
