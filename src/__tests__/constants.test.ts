import { describe, it, expect } from "vitest";
import {
  KEY_CODES,
  DEFAULT_MAX_DIMENSION,
  APPLESCRIPT_TIMEOUT_MS,
  CLIPBOARD_TIMEOUT_MS,
  INPUT_HELPER_TIMEOUT_MS,
  OPEN_COMMAND_TIMEOUT_MS,
  PERMISSION_CHECK_TIMEOUT_MS,
  ERROR_MESSAGES,
} from "../constants.js";

describe("KEY_CODES", () => {
  it("contains all 26 letters", () => {
    const letters = "abcdefghijklmnopqrstuvwxyz".split("");
    for (const letter of letters) {
      expect(KEY_CODES).toHaveProperty(letter);
      expect(typeof KEY_CODES[letter as keyof typeof KEY_CODES]).toBe("number");
    }
  });

  it("contains digits 0-9", () => {
    for (let i = 0; i <= 9; i++) {
      expect(KEY_CODES).toHaveProperty(String(i));
    }
  });

  it("contains function keys F1-F20", () => {
    for (let i = 1; i <= 20; i++) {
      expect(KEY_CODES).toHaveProperty(`F${i}`);
    }
  });

  it("contains navigation keys", () => {
    const navKeys = [
      "Return",
      "Tab",
      "Space",
      "Delete",
      "Escape",
      "UpArrow",
      "DownArrow",
      "LeftArrow",
      "RightArrow",
    ];
    for (const key of navKeys) {
      expect(KEY_CODES).toHaveProperty(key);
    }
  });

  it("all values are non-negative numbers", () => {
    for (const [, value] of Object.entries(KEY_CODES)) {
      expect(typeof value).toBe("number");
      expect(value).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("DEFAULT_MAX_DIMENSION", () => {
  it("is 0 (no resize)", () => {
    expect(DEFAULT_MAX_DIMENSION).toBe(0);
  });
});

describe("timeouts", () => {
  it("all timeouts are positive numbers", () => {
    const timeouts = [
      APPLESCRIPT_TIMEOUT_MS,
      CLIPBOARD_TIMEOUT_MS,
      INPUT_HELPER_TIMEOUT_MS,
      OPEN_COMMAND_TIMEOUT_MS,
      PERMISSION_CHECK_TIMEOUT_MS,
    ];
    for (const t of timeouts) {
      expect(typeof t).toBe("number");
      expect(t).toBeGreaterThan(0);
    }
  });
});

describe("ERROR_MESSAGES", () => {
  it("has all expected keys", () => {
    expect(ERROR_MESSAGES).toHaveProperty("TIMEOUT");
    expect(ERROR_MESSAGES).toHaveProperty("BINARY_NOT_FOUND");
  });

  it("all values are non-empty strings", () => {
    for (const [, value] of Object.entries(ERROR_MESSAGES)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
