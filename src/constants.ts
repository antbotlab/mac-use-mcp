/**
 * macOS virtual key code mappings.
 *
 * Values come from the Carbon HIToolbox `Events.h` header
 * (`kVK_*` constants). The record maps human-readable key names
 * to their numeric virtual key codes.
 */
export const KEY_CODES = {
  // Letters (QWERTY layout order from Events.h)
  a: 0x00,
  s: 0x01,
  d: 0x02,
  f: 0x03,
  h: 0x04,
  g: 0x05,
  z: 0x06,
  x: 0x07,
  c: 0x08,
  v: 0x09,
  b: 0x0b,
  q: 0x0c,
  w: 0x0d,
  e: 0x0e,
  r: 0x0f,
  y: 0x10,
  t: 0x11,
  o: 0x1f,
  u: 0x20,
  i: 0x22,
  p: 0x23,
  l: 0x25,
  j: 0x26,
  k: 0x28,
  n: 0x2d,
  m: 0x2e,

  // Numbers (top row)
  "0": 0x1d,
  "1": 0x12,
  "2": 0x13,
  "3": 0x14,
  "4": 0x15,
  "5": 0x17,
  "6": 0x16,
  "7": 0x1a,
  "8": 0x1c,
  "9": 0x19,

  // Function keys
  F1: 0x7a,
  F2: 0x78,
  F3: 0x63,
  F4: 0x76,
  F5: 0x60,
  F6: 0x61,
  F7: 0x62,
  F8: 0x64,
  F9: 0x65,
  F10: 0x6d,
  F11: 0x67,
  F12: 0x6f,
  F13: 0x69,
  F14: 0x6b,
  F15: 0x71,
  F16: 0x6a,
  F17: 0x40,
  F18: 0x4f,
  F19: 0x50,
  F20: 0x5a,

  // Navigation
  Return: 0x24,
  Tab: 0x30,
  Space: 0x31,
  Delete: 0x33,
  ForwardDelete: 0x75,
  Escape: 0x35,
  Home: 0x73,
  End: 0x77,
  PageUp: 0x74,
  PageDown: 0x79,

  // Arrow keys
  UpArrow: 0x7e,
  DownArrow: 0x7d,
  LeftArrow: 0x7b,
  RightArrow: 0x7c,

  // Modifier keys
  Command: 0x37,
  Shift: 0x38,
  Option: 0x3a,
  Control: 0x3b,
  CapsLock: 0x39,
  Function: 0x3f,
} as const;

/**
 * CGEvent modifier flag bitmasks.
 *
 * Passed to `CGEventSetFlags` / `CGEventGetFlags` to indicate
 * which modifier keys are held during a keyboard or mouse event.
 */
export const MODIFIER_FLAGS = {
  command: 0x100000,
  shift: 0x020000,
  option: 0x080000,
  control: 0x040000,
} as const;

/** Default maximum dimension (width or height) for screenshot resizing. 0 = no resize. */
export const DEFAULT_MAX_DIMENSION = 0;

// -- Timeouts ----------------------------------------------------------------

/** Timeout for AppleScript execution via osascript (ms). */
export const APPLESCRIPT_TIMEOUT_MS = 15_000;

/** Timeout for clipboard commands: pbpaste, pbcopy (ms). */
export const CLIPBOARD_TIMEOUT_MS = 5_000;

/** Timeout for screencapture and sips image-processing commands (ms). */
export const SCREENCAPTURE_TIMEOUT_MS = 10_000;

/** Timeout for Swift input-helper binary execution (ms). */
export const INPUT_HELPER_TIMEOUT_MS = 5_000;

/** Timeout for the `open` command in window management (ms). */
export const OPEN_COMMAND_TIMEOUT_MS = 5_000;

/** Timeout for permission check probes: accessibility and screen recording (ms). */
export const PERMISSION_CHECK_TIMEOUT_MS = 5_000;

/**
 * Standardized error messages used across the MCP server.
 */
export const ERROR_MESSAGES = {
  TIMEOUT: "Operation timed out",
  PERMISSION_DENIED:
    "Accessibility permission denied — grant access in System Settings > Privacy & Security > Accessibility",
  BINARY_NOT_FOUND:
    "Required helper binary not found — run `pnpm run build:swift` to compile native helpers",
  INVALID_ARGS: "Invalid arguments provided to tool",
} as const;
