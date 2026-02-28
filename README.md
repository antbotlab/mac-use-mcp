# mac-use-mcp

Zero-dependency macOS desktop automation via MCP.

<!-- TODO: Record demo GIF -->

[![npm version](https://img.shields.io/npm/v/mac-use-mcp)](https://www.npmjs.com/package/mac-use-mcp)
[![license](https://img.shields.io/npm/l/mac-use-mcp)](./LICENSE)
![macOS 13+](https://img.shields.io/badge/macOS-13%2B-blue)
![Node 22+](https://img.shields.io/badge/Node-22%2B-green)
[![CI](https://github.com/antbotlab/mac-use-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/antbotlab/mac-use-mcp/actions/workflows/ci.yml)

## Install

No build steps. No native dependencies. Just run:

```bash
npx mac-use-mcp
```

## Tools

mac-use-mcp exposes 16 tools to any MCP-compatible client:

| Tool | Description |
| --- | --- |
| `screenshot` | Capture the screen or a specific region |
| `click` | Click at screen coordinates (left, right, double) |
| `move_mouse` | Move the cursor to a position |
| `scroll` | Scroll in any direction at a position |
| `drag` | Drag from one point to another |
| `type_text` | Type a string of text |
| `press_key` | Press a key or key combination |
| `get_screen_info` | Get display resolution and scaling info |
| `get_cursor_position` | Get current cursor coordinates |
| `list_windows` | List all visible windows with positions |
| `focus_window` | Bring a window to the front |
| `open_application` | Launch an application by name |
| `clipboard_read` | Read the system clipboard contents |
| `clipboard_write` | Write text to the system clipboard |
| `wait` | Pause for a specified duration |
| `check_permissions` | Verify Accessibility and Screen Recording access |

## MCP Client Configuration

### Claude Code

```bash
claude mcp add mac-use-mcp -- npx mac-use-mcp
```

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mac-use-mcp": {
      "command": "npx",
      "args": ["mac-use-mcp"]
    }
  }
}
```

### Cursor

Add to Cursor MCP settings:

```json
{
  "mcpServers": {
    "mac-use-mcp": {
      "command": "npx",
      "args": ["mac-use-mcp"]
    }
  }
}
```

### Windsurf

Add to Windsurf MCP settings:

```json
{
  "mcpServers": {
    "mac-use-mcp": {
      "command": "npx",
      "args": ["mac-use-mcp"]
    }
  }
}
```

### Cline

Add to Cline MCP settings:

```json
{
  "mcpServers": {
    "mac-use-mcp": {
      "command": "npx",
      "args": ["mac-use-mcp"]
    }
  }
}
```

## Permission Setup

mac-use-mcp requires two macOS permissions to function. Grant them once and you're set.

### Accessibility

Required for mouse and keyboard control.

1. Open **System Settings** > **Privacy & Security** > **Accessibility**
2. Click the **+** button
3. Add your MCP client application (e.g., Claude Desktop, your terminal emulator)
4. Ensure the toggle is enabled

### Screen Recording

Required for screenshots.

1. Open **System Settings** > **Privacy & Security** > **Screen Recording**
2. Click the **+** button
3. Add your MCP client application
4. Ensure the toggle is enabled
5. Restart the application if prompted

> Use the `check_permissions` tool to verify both permissions are granted correctly.

## Why mac-use-mcp?

| Project | Limitation | mac-use-mcp Advantage |
| --- | --- | --- |
| [Peekaboo](https://github.com/nicholascpark/peekaboo) | macOS 15+ only, complex setup, beta stability issues | macOS 13+, zero config |
| [automation-mcp](https://github.com/xdrdak/automation-mcp) | nut.js native dependency, build failures on Apple Silicon | Zero native deps |
| [macos-automator-mcp](https://github.com/mcp-macos-automator/macos-automator-mcp) | AppleScript only, no input events | Full input + screenshot |

- **Zero native dependencies** — no node-gyp, no prebuild, no Xcode Command Line Tools required beyond what ships with macOS
- **Broad compatibility** — supports macOS 13 Ventura and later, including both Intel and Apple Silicon
- **Instant setup** — `npx mac-use-mcp` is all it takes; no build step, no config file

## Known Limitations

- **Screen Recording prompt on Sequoia**: macOS 15 shows a monthly system prompt asking to reconfirm Screen Recording access. This is an OS-level behavior and cannot be suppressed.
- **Secure input fields**: Password fields and other secure text inputs block synthetic keyboard events. This is a macOS security feature.
- **System dialogs**: Some system-level dialogs (e.g., FileVault unlock, Login Window) cannot be interacted with programmatically due to macOS security restrictions.

## License

[MIT](./LICENSE) &copy; 2026 antbotlab
