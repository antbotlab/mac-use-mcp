# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.1.1] - 2026-03-02

### Added
- `mcpName` field in package.json for Official MCP Registry publishing
- `server.json` for MCP Registry metadata
- `smithery.yaml` for Smithery directory registration

## [1.1.0] - 2026-03-02

### Added
- `screenshot` ruler overlay (`ruler` parameter) for precise coordinate reading

### Docs
- Add safety warning for sandbox usage and data protection
- Add model recommendations and MCP client configurations
- Add banner and demo GIF

## [1.0.1] - 2026-03-02

### Fixed
- Double/triple click recognition via inter-event delay in Swift CGEvent layer (#25)
- Negative coordinate support for multi-monitor setups across click, move, scroll, drag, and screenshot schemas (#25)
- Screenshot coordinate origin calculation for non-primary displays (#26)
- `list_windows` filters out system artifacts and empty-title windows (#26)
- Swift input-helper propagates structured error on failure instead of silent crash (#26)

### Added
- Off-screen coordinate warning when click/move/scroll/drag targets fall outside all display bounds (#26)

## [1.0.0] - 2026-03-01

### Security
- AppleScript string sanitization: strip all C0 control characters (U+0000–U+001F) and DEL (U+007F) before escaping
- Input length limits (`.max()`) on all string input schemas to prevent abuse
- Randomized temp paths for permission test files
- `type_text` description warns that clipboard contents are temporarily replaced
- `get_ui_elements` description warns about potential sensitive data exposure

### Added
- `--version` and `--help` CLI flags
- TTY detection with helpful message when run interactively
- Node.js 22+ runtime version check
- Annotations (`readOnlyHint`, `destructiveHint`) on keyboard tools
- Zod validation for Swift screenshot responses (replaces `as unknown as` cast)
- Universal binary (arm64 + x86_64) for Intel and Apple Silicon Macs
- `.prettierrc` with default config
- Unit test suite: 156 tests across 15 files covering schema validation, tool registration, error handling, pure helpers, and queue behavior
- Vitest test runner with CI integration
- `tsconfig.build.json` to separate build and type-check concerns

### Changed
- `type_text` returns `typed_length` instead of echoing full text in response
- `PASTE_SETTLE_MS` increased from 50ms to 100ms for clipboard reliability
- `open_application` annotation corrected: `destructiveHint: true`
- `check_permissions` routed through serial queue for correctness
- Build script uses `tsconfig.build.json` to exclude test files from output
- Export pure helper functions for direct unit testing

### Removed
- Legacy `screencapture` CLI fallback (~160 lines) — Swift binary is the sole capture path
- Dead constants: `MODIFIER_FLAGS`, `SCREENCAPTURE_TIMEOUT_MS`, unused `ERROR_MESSAGES` entries

### Fixed
- Demo GIF renders on npm (absolute URL)
- `package.json` description aligned with README ("Zero-native-dependency")

### Docs
- CONTRIBUTING.md: added test scripts (`pnpm test`, `pnpm test:watch`)
- PR template: added test checklist item
- README: permission caveat on "just works" tagline, macOS-only install note

## [0.2.0] - 2026-03-01

### Added
- Built-in screenshot via `CGWindowListCreateImage` — single-process capture at logical resolution, replacing the 3-process `screencapture` + `sips` pipeline
- Universal coordinate mapping formula (`screen = origin + pixel * scale`) in screenshot response, with 1:1 identity mapping by default
- `click_menu` tool: click menu bar items by path (e.g., `"File > Save As..."`)
- `get_ui_elements` tool: semantic UI element discovery via macOS Accessibility API with role/title filters and BFS traversal
- Fuzzy app name matching for `list_windows`, `focus_window`, `open_application`, and `click_menu` (case-insensitive exact/prefix/contains)
- Window title → ID resolution via `CGWindowListCopyWindowInfo` (replaces AppleScript, eliminates injection surface)
- Operation guidance to tool descriptions (#3)

### Changed
- Default `max_dimension` changed from 1024 to 0 (no resize) — image coordinates equal screen coordinates out of the box
- Screenshot captures at logical pixels (not physical) — eliminates Retina scaling mismatch
- Swift `input-helper` binary now handles screenshot, window enumeration, and UI element queries natively
- Build script targets macOS 13.0 explicitly to suppress SDK deprecation warnings

### Fixed
- Use logical points instead of physical pixels for coordinates (#1)
- Add drag best practices and fix default duration (#2)

## [0.1.0] - 2026-03-01

### Added

- MCP server with stdio transport and 16 tool endpoints
- `screenshot` tool: full screen, region, and window capture with configurable format and max dimension
- `click` tool: left/right/middle button, single/double/triple click, modifier keys
- `move_mouse` tool: move cursor to screen coordinates
- `scroll` tool: scroll in any direction at a position with configurable amount
- `drag` tool: drag between two screen coordinates with configurable duration
- `type_text` tool: type text via CGEvent key synthesis with full Unicode support (CJK, emoji)
- `press_key` tool: simulate key press with modifier combos (e.g. `cmd+c`, `ctrl+shift+F5`)
- `get_screen_info` tool: query display count, resolution, origin, and scale factor
- `get_cursor_position` tool: read current mouse cursor coordinates
- `list_windows` tool: enumerate visible windows with app, title, ID, position, size, and minimized state
- `focus_window` tool: activate an application and optionally raise a specific window
- `open_application` tool: launch an app by name or bundle identifier
- `clipboard_read` tool: read macOS clipboard as plain text
- `clipboard_write` tool: write text to macOS clipboard
- `wait` tool: pause execution for a specified duration
- `check_permissions` tool: verify Accessibility and Screen Recording permissions
- Swift CGEvent input helper binary for mouse, keyboard, scroll, drag, and secure input detection
- Serial execution queue to prevent race conditions between system-level operations
- Screencapture helper with sips-based resize and base64 encoding
- AppleScript helper with structured error parsing
- Clipboard helper using native pbcopy/pbpaste
- macOS virtual key code mappings (Carbon HIToolbox `Events.h` constants)
- Project scaffolding with TypeScript, ESLint, and Prettier
- GitHub Actions CI workflow for macOS
- Open-source community files (contributing guide, code of conduct, security policy)

[Unreleased]: https://github.com/antbotlab/mac-use-mcp/compare/v1.1.1...HEAD
[1.1.1]: https://github.com/antbotlab/mac-use-mcp/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/antbotlab/mac-use-mcp/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/antbotlab/mac-use-mcp/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/antbotlab/mac-use-mcp/compare/v0.2.0...v1.0.0
[0.2.0]: https://github.com/antbotlab/mac-use-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/antbotlab/mac-use-mcp/releases/tag/v0.1.0
