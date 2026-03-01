import { describe, it, expect, vi, beforeEach } from "vitest";
import { z, ZodError } from "zod";
import { buildMenuClickScript } from "../../tools/menu.js";

// Mock dependencies for handler tests
vi.mock("../../helpers/applescript.js", () => ({
  runAppleScript: vi.fn(),
  escapeAppleScriptString: vi.fn((s: string) =>
    s.replace(/\\/g, "\\\\").replace(/"/g, '\\"'),
  ),
}));

vi.mock("../../helpers/app-resolver.js", () => ({
  resolveAppName: vi.fn((name: string) => Promise.resolve(name)),
}));

import { runAppleScript } from "../../helpers/applescript.js";
import { menuToolHandlers } from "../../tools/menu.js";

const mockRunAppleScript = vi.mocked(runAppleScript);

// Schema (must mirror src/tools/menu.ts)
const ClickMenuInputSchema = z.object({
  app: z.string().max(1_000),
  path: z.string().max(1_000),
});

describe("click_menu schema", () => {
  it("accepts valid input", () => {
    const result = ClickMenuInputSchema.parse({
      app: "Finder",
      path: "File > New Window",
    });
    expect(result.app).toBe("Finder");
    expect(result.path).toBe("File > New Window");
  });

  it("rejects missing app", () => {
    expect(() => ClickMenuInputSchema.parse({ path: "File > Save" })).toThrow(
      ZodError,
    );
  });

  it("rejects missing path", () => {
    expect(() => ClickMenuInputSchema.parse({ app: "Finder" })).toThrow(
      ZodError,
    );
  });

  it("rejects app exceeding max length (1000)", () => {
    expect(() =>
      ClickMenuInputSchema.parse({
        app: "a".repeat(1_001),
        path: "File > Save",
      }),
    ).toThrow(ZodError);
  });

  it("rejects path exceeding max length (1000)", () => {
    expect(() =>
      ClickMenuInputSchema.parse({
        app: "Finder",
        path: "a".repeat(1_001),
      }),
    ).toThrow(ZodError);
  });
});

describe("buildMenuClickScript", () => {
  it("builds script for 2 segments (File > Save As...)", () => {
    const script = buildMenuClickScript("Finder", ["File", "Save As..."]);
    expect(script).toContain('click menu item "Save As..."');
    expect(script).toContain('of menu "File"');
    expect(script).toContain('of menu bar item "File"');
    expect(script).toContain("of menu bar 1");
    expect(script).toContain('tell process "Finder"');
  });

  it("builds script for 3 segments (View > Sort By > Name)", () => {
    const script = buildMenuClickScript("Finder", ["View", "Sort By", "Name"]);
    expect(script).toContain('click menu item "Name"');
    expect(script).toContain('of menu "Sort By"');
    expect(script).toContain('of menu item "Sort By"');
    expect(script).toContain('of menu "View"');
    expect(script).toContain('of menu bar item "View"');
  });

  it("escapes special characters in menu paths", () => {
    const script = buildMenuClickScript('App "Special"', [
      "File",
      'Save "Copy"',
    ]);
    expect(script).toContain('App \\"Special\\"');
    expect(script).toContain('Save \\"Copy\\"');
  });
});

describe("click_menu handler", () => {
  const handler = menuToolHandlers.click_menu;

  beforeEach(() => {
    vi.resetAllMocks();
    mockRunAppleScript.mockResolvedValue("");
  });

  it("returns error for single-segment path", async () => {
    const result = await handler({ app: "Finder", path: "File" });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Invalid menu path");
  });

  it("succeeds for valid 2-segment path", async () => {
    const result = await handler({
      app: "Finder",
      path: "File > New Window",
    });
    expect(result.isError).toBeUndefined();
    const text = JSON.parse(
      (result.content[0] as { text: string }).text,
    ) as Record<string, unknown>;
    expect(text.success).toBe(true);
  });
});
