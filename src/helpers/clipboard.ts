import { execFile } from "node:child_process";
import { execFileAsync } from "./exec.js";
import { CLIPBOARD_TIMEOUT_MS } from "../constants.js";

/**
 * Read the current contents of the macOS clipboard as plain text.
 *
 * Uses the native `pbpaste` command.
 *
 * @returns The clipboard text content.
 * @throws If pbpaste fails or times out.
 */
export async function clipboardRead(): Promise<string> {
  const { stdout } = await execFileAsync("pbpaste", [], {
    timeout: CLIPBOARD_TIMEOUT_MS,
  });
  return stdout;
}

/**
 * Write text to the macOS clipboard.
 *
 * Pipes the provided text to the native `pbcopy` command via stdin.
 *
 * @param text - The text to write to the clipboard.
 * @throws If pbcopy fails or times out.
 */
export async function clipboardWrite(text: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = execFile(
      "pbcopy",
      [],
      { timeout: CLIPBOARD_TIMEOUT_MS },
      (error: Error | null) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      },
    );

    if (!proc.stdin) {
      reject(new Error("Failed to open stdin for pbcopy"));
      return;
    }

    proc.stdin.write(text);
    proc.stdin.end();
  });
}
