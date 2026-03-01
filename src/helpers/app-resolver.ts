import { runAppleScript } from "./applescript.js";

/**
 * Resolve a user-provided app name to the actual process name.
 *
 * Strategy (in order):
 * 1. Exact match (case-insensitive) against running process names
 * 2. Prefix match: "Code" matches "Code - Insiders"
 * 3. Contains match: "chrome" matches "Google Chrome"
 * 4. No match: return the original string (let macOS handle it)
 */

// -- Process name cache ------------------------------------------------------

/** Short-lived cache to avoid repeated System Events queries. */
let cachedProcessNames: string[] | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 2_000;

/**
 * Retrieve names of all foreground (non-background-only) processes via
 * System Events. Results are cached for {@link CACHE_TTL_MS} to avoid
 * redundant AppleScript calls within rapid successive tool invocations.
 */
async function getRunningProcessNames(): Promise<string[]> {
  const now = Date.now();
  if (cachedProcessNames && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedProcessNames;
  }

  const output = await runAppleScript(
    'tell application "System Events" to get name of every process whose background only is false',
  );

  // osascript returns comma-separated: "Finder, Safari, Code"
  cachedProcessNames = output
    .split(", ")
    .map((n) => n.trim())
    .filter((n) => n.length > 0);
  cacheTimestamp = now;
  return cachedProcessNames;
}

// -- Matching ----------------------------------------------------------------

/**
 * Find the best matching process name for a query string.
 *
 * @returns The matched process name, or `null` if no match is found.
 */
function matchProcessName(query: string, names: string[]): string | null {
  const q = query.toLowerCase();

  // Exact match (case-insensitive)
  const exact = names.find((n) => n.toLowerCase() === q);
  if (exact) return exact;

  // Prefix match
  const prefix = names.find((n) => n.toLowerCase().startsWith(q));
  if (prefix) return prefix;

  // Contains match
  const contains = names.find((n) => n.toLowerCase().includes(q));
  if (contains) return contains;

  return null;
}

// -- Public API --------------------------------------------------------------

/**
 * Resolve a user-provided app name to the actual running process name.
 *
 * Attempts exact, prefix, and contains matching (all case-insensitive)
 * against currently running foreground processes. Returns the original
 * query unchanged when no match is found, allowing macOS to handle it
 * directly.
 *
 * @param query - The app name provided by the user.
 * @returns The resolved process name, or the original query if unmatched.
 */
export async function resolveAppName(query: string): Promise<string> {
  try {
    const names = await getRunningProcessNames();
    return matchProcessName(query, names) ?? query;
  } catch {
    // If process enumeration fails, fall back to the original query
    // so downstream tools can still attempt to use it as-is.
    return query;
  }
}
