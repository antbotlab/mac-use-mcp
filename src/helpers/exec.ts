import { execFile } from "node:child_process";
import { promisify } from "node:util";

/** Promisified child_process.execFile for async/await usage. */
export const execFileAsync = promisify(execFile);
