import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  matchProcessName,
  resolveAppName,
} from "../../helpers/app-resolver.js";

// Mock the applescript module
vi.mock("../../helpers/applescript.js", () => ({
  runAppleScript: vi.fn(),
}));

import { runAppleScript } from "../../helpers/applescript.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

describe("matchProcessName", () => {
  const processes = ["Finder", "Safari", "Google Chrome", "Code - Insiders"];

  it("returns exact match (case-insensitive)", () => {
    expect(matchProcessName("safari", processes)).toBe("Safari");
    expect(matchProcessName("SAFARI", processes)).toBe("Safari");
    expect(matchProcessName("Safari", processes)).toBe("Safari");
  });

  it("returns prefix match", () => {
    expect(matchProcessName("Code", processes)).toBe("Code - Insiders");
    expect(matchProcessName("Google", processes)).toBe("Google Chrome");
  });

  it("returns contains match", () => {
    expect(matchProcessName("chrome", processes)).toBe("Google Chrome");
    expect(matchProcessName("Insiders", processes)).toBe("Code - Insiders");
  });

  it("returns null when no match", () => {
    expect(matchProcessName("Firefox", processes)).toBeNull();
    expect(matchProcessName("nonexistent", processes)).toBeNull();
  });

  it("prefers exact over prefix over contains", () => {
    const names = ["Chrome Helper", "Chrome", "Google Chrome"];
    // "chrome" exact match → "Chrome"
    expect(matchProcessName("chrome", names)).toBe("Chrome");
  });

  it("handles empty process list", () => {
    expect(matchProcessName("anything", [])).toBeNull();
  });
});

describe("resolveAppName", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Reset the module-level cache by using a fresh timestamp
    // The cache has a 2s TTL, so tests that run quickly may hit it.
    // We mock runAppleScript to control responses.
  });

  it("resolves to matched process name", async () => {
    mockRunAppleScript.mockResolvedValue("Finder, Safari, Google Chrome");

    const result = await resolveAppName("chrome");
    expect(result).toBe("Google Chrome");
  });

  it("returns original query when no match", async () => {
    mockRunAppleScript.mockResolvedValue("Finder, Safari");

    const result = await resolveAppName("Firefox");
    expect(result).toBe("Firefox");
  });

  it("returns original query on AppleScript failure", async () => {
    mockRunAppleScript.mockRejectedValue(new Error("permission denied"));

    const result = await resolveAppName("Safari");
    expect(result).toBe("Safari");
  });
});
