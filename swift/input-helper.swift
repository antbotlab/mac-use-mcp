import CoreGraphics
import Foundation

// MARK: - Output Helpers

/// Serialize a dictionary to JSON and print to stdout.
func outputJSON(_ dict: [String: Any]) {
    guard let data = try? JSONSerialization.data(
        withJSONObject: dict,
        options: []
    ) else {
        // Last-resort fallback when serialization itself fails
        print("{\"success\":false,\"error\":\"JSON serialization failed\"}")
        exit(1)
    }
    print(String(data: data, encoding: .utf8)!)
}

/// Print an error response and exit with code 1.
func fail(_ message: String) -> Never {
    outputJSON(["success": false, "error": message])
    exit(1)
}

// MARK: - Modifier Helpers

/// Map of human-readable modifier names to CGEventFlags raw values.
private let modifierFlagMap: [String: UInt64] = [
    "cmd":   0x100000,
    "shift": 0x020000,
    "ctrl":  0x040000,
    "opt":   0x080000,
]

/// Apply string-based modifier names to a CGEvent.
///
/// Recognized names: "cmd", "shift", "ctrl", "opt".
/// Unknown names are silently ignored.
func applyModifiers(_ event: CGEvent, _ modifiers: [String]) {
    guard !modifiers.isEmpty else { return }
    var rawFlags = event.flags.rawValue
    for name in modifiers {
        if let flag = modifierFlagMap[name.lowercased()] {
            rawFlags |= flag
        }
    }
    event.flags = CGEventFlags(rawValue: rawFlags)
}

// MARK: - Pointer Command Handlers

/// Extract a numeric value from a JSON dictionary as a CGFloat.
///
/// JSONSerialization may return Int, Double, or NSNumber depending on the
/// JSON literal. This helper normalizes all cases to CGFloat.
func requireCGFloat(_ args: [String: Any], key: String, command: String) -> CGFloat {
    if let intVal = args[key] as? Int {
        return CGFloat(intVal)
    }
    if let doubleVal = args[key] as? Double {
        return CGFloat(doubleVal)
    }
    fail("\(command): missing required '\(key)' numeric argument")
}

/// Handle the "click" command.
///
/// Args: {"x":Int, "y":Int, "button":"left"|"right"|"middle",
///        "count":1-3, "modifiers":[...]}
func handleClick(_ args: [String: Any]) {
    let x = requireCGFloat(args, key: "x", command: "click")
    let y = requireCGFloat(args, key: "y", command: "click")

    let button = args["button"] as? String ?? "left"
    let count = args["count"] as? Int ?? 1
    let modifiers = args["modifiers"] as? [String] ?? []
    let point = CGPoint(x: x, y: y)

    // Determine event types and mouse button constant based on button name
    let downType: CGEventType
    let upType: CGEventType
    let mouseButton: CGMouseButton

    switch button {
    case "left":
        downType = .leftMouseDown
        upType = .leftMouseUp
        mouseButton = .left
    case "right":
        downType = .rightMouseDown
        upType = .rightMouseUp
        mouseButton = .right
    case "middle":
        downType = .otherMouseDown
        upType = .otherMouseUp
        mouseButton = .center
    default:
        fail("click: unknown button '\(button)' — expected left, right, or middle")
    }

    for clickIndex in 1...count {
        guard let downEvent = CGEvent(
            mouseEventSource: nil,
            mouseType: downType,
            mouseCursorPosition: point,
            mouseButton: mouseButton
        ),
        let upEvent = CGEvent(
            mouseEventSource: nil,
            mouseType: upType,
            mouseCursorPosition: point,
            mouseButton: mouseButton
        ) else {
            fail("click: failed to create CGEvent")
        }

        // Set click state for multi-click sequences (double-click, triple-click)
        if count > 1 {
            downEvent.setIntegerValueField(.mouseEventClickState, value: Int64(clickIndex))
            upEvent.setIntegerValueField(.mouseEventClickState, value: Int64(clickIndex))
        }

        applyModifiers(downEvent, modifiers)
        applyModifiers(upEvent, modifiers)

        downEvent.post(tap: .cghidEventTap)
        upEvent.post(tap: .cghidEventTap)
    }

    outputJSON(["success": true])
}

/// Handle the "move" command.
///
/// Args: {"x":Int, "y":Int}
func handleMove(_ args: [String: Any]) {
    let x = requireCGFloat(args, key: "x", command: "move")
    let y = requireCGFloat(args, key: "y", command: "move")

    let point = CGPoint(x: x, y: y)

    guard let event = CGEvent(
        mouseEventSource: nil,
        mouseType: .mouseMoved,
        mouseCursorPosition: point,
        mouseButton: .left
    ) else {
        fail("move: failed to create CGEvent")
    }

    event.post(tap: .cghidEventTap)
    outputJSON(["success": true])
}

/// Handle the "cursor" command.
///
/// Args: {} (none required)
/// Returns: {"success":true, "x":Double, "y":Double}
func handleCursor() {
    guard let event = CGEvent(source: nil) else {
        fail("cursor: failed to create CGEvent to read cursor position")
    }

    let location = event.location
    outputJSON([
        "success": true,
        "x": Int(location.x),
        "y": Int(location.y),
    ])
}

// MARK: - Placeholder Handlers

/// Commands that are not yet implemented.
private let placeholderCommands: Set<String> = [
    "type", "key", "scroll", "drag", "secure",
]

func handlePlaceholder(_ command: String) {
    fail("\(command): not implemented")
}

// MARK: - Main Entry Point

let arguments = CommandLine.arguments

guard arguments.count >= 2 else {
    fail("usage: input-helper <command> [json_args]")
}

let command = arguments[1]
let jsonString = arguments.count >= 3 ? arguments[2] : "{}"

// Parse the JSON argument string into a dictionary
guard let jsonData = jsonString.data(using: .utf8),
      let parsed = try? JSONSerialization.jsonObject(with: jsonData, options: []),
      let args = parsed as? [String: Any] else {
    fail("invalid JSON argument: \(jsonString)")
}

// Dispatch to the appropriate command handler
switch command {
case "click":
    handleClick(args)
case "move":
    handleMove(args)
case "cursor":
    handleCursor()
case _ where placeholderCommands.contains(command):
    handlePlaceholder(command)
default:
    fail("unknown command: \(command)")
}
