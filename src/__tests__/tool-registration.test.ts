import { describe, it, expect } from "vitest";

import {
  utilityToolDefinitions,
  utilityToolHandlers,
} from "../tools/utility.js";
import { screenToolDefinitions, screenToolHandlers } from "../tools/screen.js";
import {
  screenshotToolDefinitions,
  screenshotToolHandlers,
} from "../tools/screenshot.js";
import { mouseToolDefinitions, mouseToolHandlers } from "../tools/mouse.js";
import {
  keyboardToolDefinitions,
  keyboardToolHandlers,
} from "../tools/keyboard.js";
import { windowToolDefinitions, windowToolHandlers } from "../tools/window.js";
import {
  clipboardToolDefinitions,
  clipboardToolHandlers,
} from "../tools/clipboard.js";
import { menuToolDefinitions, menuToolHandlers } from "../tools/menu.js";
import {
  accessibilityToolDefinitions,
  accessibilityToolHandlers,
} from "../tools/accessibility.js";

const allToolDefinitions = [
  ...utilityToolDefinitions,
  ...screenToolDefinitions,
  ...screenshotToolDefinitions,
  ...mouseToolDefinitions,
  ...keyboardToolDefinitions,
  ...windowToolDefinitions,
  ...clipboardToolDefinitions,
  ...menuToolDefinitions,
  ...accessibilityToolDefinitions,
];

const allToolHandlers: Record<string, unknown> = {
  ...utilityToolHandlers,
  ...screenToolHandlers,
  ...screenshotToolHandlers,
  ...mouseToolHandlers,
  ...keyboardToolHandlers,
  ...windowToolHandlers,
  ...clipboardToolHandlers,
  ...menuToolHandlers,
  ...accessibilityToolHandlers,
};

const EXPECTED_TOOL_NAMES = [
  "check_permissions",
  "wait",
  "get_screen_info",
  "get_cursor_position",
  "screenshot",
  "click",
  "move_mouse",
  "scroll",
  "drag",
  "type_text",
  "press_key",
  "list_windows",
  "focus_window",
  "open_application",
  "clipboard_read",
  "clipboard_write",
  "click_menu",
  "get_ui_elements",
];

describe("tool registration", () => {
  it("registers exactly 18 tools", () => {
    expect(allToolDefinitions).toHaveLength(18);
  });

  it("registers all expected tool names", () => {
    const names = allToolDefinitions.map((t) => t.name);
    for (const expected of EXPECTED_TOOL_NAMES) {
      expect(names).toContain(expected);
    }
  });

  it("has no duplicate tool names", () => {
    const names = allToolDefinitions.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("every tool definition has a matching handler", () => {
    for (const def of allToolDefinitions) {
      expect(allToolHandlers).toHaveProperty(def.name);
      expect(typeof allToolHandlers[def.name]).toBe("function");
    }
  });

  it("every handler has a matching tool definition", () => {
    const definedNames = new Set(allToolDefinitions.map((t) => t.name));
    for (const handlerName of Object.keys(allToolHandlers)) {
      expect(definedNames.has(handlerName)).toBe(true);
    }
  });

  it("every tool definition has a valid inputSchema", () => {
    for (const def of allToolDefinitions) {
      expect(def.inputSchema).toBeDefined();
      expect(def.inputSchema.type).toBe("object");
    }
  });

  it("every tool definition has a non-empty description", () => {
    for (const def of allToolDefinitions) {
      expect(def.description).toBeTruthy();
      expect(typeof def.description).toBe("string");
    }
  });
});
