# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Unit test suite: 156 tests across 15 files covering schema validation, tool registration, error handling, pure helpers, and queue behavior
- Vitest test runner with CI integration (`pnpm test` step in GitHub Actions)
- `tsconfig.build.json` to separate build and type-check concerns (test files excluded from `dist/`)

### Changed
- Build script uses `tsconfig.build.json` (`tsc -p tsconfig.build.json`) to exclude test files from output
- Export pure helper functions for direct unit testing: `parseAppleScriptError`, `matchProcessName`, `scrollDirectionToDeltas`, `isBundleId`, `buildMenuClickScript`

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

[Unreleased]: https://github.com/antbotlab/mac-use-mcp/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/antbotlab/mac-use-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/antbotlab/mac-use-mcp/releases/tag/v0.1.0
