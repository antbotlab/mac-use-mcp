import Carbon
import Cocoa
import CoreGraphics
import Foundation
import ImageIO

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
/// Accepts both short ("cmd") and full ("command") names for robustness.
private let modifierFlagMap: [String: UInt64] = [
    "cmd":     0x100000,
    "command": 0x100000,
    "shift":   0x020000,
    "ctrl":    0x040000,
    "control": 0x040000,
    "opt":     0x080000,
    "option":  0x080000,
    "alt":     0x080000,
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

// MARK: - Bounds Check Helper

/// Check whether a point is within any active display's bounds.
///
/// Returns a warning string if the point is outside all screens, or nil if within bounds.
func offScreenWarning(x: CGFloat, y: CGFloat) -> String? {
    let bounds = logicalScreenBounds()
    let point = CGPoint(x: x, y: y)
    if bounds.contains(point) {
        return nil
    }
    return "Coordinates (\(Int(x)), \(Int(y))) are outside all screen bounds \(Int(bounds.origin.x)),\(Int(bounds.origin.y)) \(Int(bounds.size.width))x\(Int(bounds.size.height))"
}

// MARK: - Pointer Command Handlers

/// Inter-event delay (microseconds) between click pairs so macOS recognizes
/// multi-click sequences. Must be well below the system double-click threshold (~500ms).
private let multiClickDelayUs: UInt32 = 50_000

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

        // Brief delay between click pairs so macOS recognizes multi-click sequences
        if count > 1 && clickIndex < count {
            usleep(multiClickDelayUs)
        }
    }

    var result: [String: Any] = ["success": true]
    if let warning = offScreenWarning(x: x, y: y) {
        result["warning"] = warning
    }
    outputJSON(result)
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

    var result: [String: Any] = ["success": true]
    if let warning = offScreenWarning(x: x, y: y) {
        result["warning"] = warning
    }
    outputJSON(result)
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

// MARK: - Keyboard Helpers

/// Translate a virtual key code to Unicode character(s) using the current keyboard layout.
///
/// Returns nil for non-printable keys (Return, Tab, Escape, arrow keys, etc.).
private func translateKeyCode(_ keyCode: UInt16, modifierFlags: CGEventFlags) -> String? {
    guard let inputSource = TISCopyCurrentKeyboardInputSource()?.takeRetainedValue(),
          let rawLayoutData = TISGetInputSourceProperty(inputSource, kTISPropertyUnicodeKeyLayoutData) else {
        return nil
    }

    let layoutData = unsafeBitCast(rawLayoutData, to: CFData.self)
    let keyLayoutPtr = unsafeBitCast(
        CFDataGetBytePtr(layoutData),
        to: UnsafePointer<UCKeyboardLayout>.self
    )

    // Convert CGEventFlags to Carbon modifier key state
    var modifierKeyState: UInt32 = 0
    let rawFlags = modifierFlags.rawValue
    if rawFlags & CGEventFlags.maskShift.rawValue != 0 {
        modifierKeyState |= UInt32(shiftKey >> 8) & 0xFF
    }
    if rawFlags & CGEventFlags.maskCommand.rawValue != 0 {
        modifierKeyState |= UInt32(cmdKey >> 8) & 0xFF
    }
    if rawFlags & CGEventFlags.maskAlternate.rawValue != 0 {
        modifierKeyState |= UInt32(optionKey >> 8) & 0xFF
    }
    if rawFlags & CGEventFlags.maskControl.rawValue != 0 {
        modifierKeyState |= UInt32(controlKey >> 8) & 0xFF
    }

    var deadKeyState: UInt32 = 0
    let maxChars = 4
    var length = 0
    var chars = [UniChar](repeating: 0, count: maxChars)

    let status = UCKeyTranslate(
        keyLayoutPtr,
        keyCode,
        UInt16(kUCKeyActionDown),
        modifierKeyState,
        UInt32(LMGetKbdType()),
        UInt32(kUCKeyTranslateNoDeadKeysBit),
        &deadKeyState,
        maxChars,
        &length,
        &chars
    )

    guard status == noErr, length > 0 else { return nil }

    let result = String(utf16CodeUnits: chars, count: length)
    // Skip control characters (Return=\r, Tab=\t, Escape=\u{1b}, etc.)
    if result.unicodeScalars.allSatisfy({ $0.value < 32 }) {
        return nil
    }
    return result
}

// MARK: - Keyboard Command Handlers

/// Maximum number of UTF-16 code units per chunk for keyboardSetUnicodeString.
private let maxUTF16UnitsPerChunk = 20

/// Handle the "type" command.
///
/// Produces text output by synthesizing keyboard events with Unicode strings.
/// Supports full Unicode including CJK and emoji.
///
/// Args: {"text":"string", "delay":0}
///   - text:  The string to type.
///   - delay: Milliseconds to wait between characters (default 0).
func handleType(_ args: [String: Any]) {
    guard let text = args["text"] as? String, !text.isEmpty else {
        fail("type: missing required 'text' string argument")
    }

    let delayMs = args["delay"] as? Int ?? 0

    // Convert the full string to UTF-16 code units
    let utf16Units = Array(text.utf16)

    // Process in chunks of up to maxUTF16UnitsPerChunk code units
    var offset = 0
    while offset < utf16Units.count {
        let remaining = utf16Units.count - offset
        let chunkSize = min(remaining, maxUTF16UnitsPerChunk)
        var chunk = Array(utf16Units[offset..<(offset + chunkSize)])

        guard let keyDown = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: true),
              let keyUp = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) else {
            fail("type: failed to create CGEvent")
        }

        keyDown.keyboardSetUnicodeString(stringLength: chunkSize, unicodeString: &chunk)
        keyUp.keyboardSetUnicodeString(stringLength: chunkSize, unicodeString: &chunk)

        keyDown.post(tap: .cghidEventTap)
        keyUp.post(tap: .cghidEventTap)

        offset += chunkSize

        if delayMs > 0 && offset < utf16Units.count {
            usleep(UInt32(delayMs * 1000))
        }
    }

    outputJSON(["success": true])
}

/// Handle the "key" command.
///
/// Synthesizes a single key press with optional modifier flags.
/// Populates Unicode character data via UCKeyTranslate so that apps
/// relying on character data (e.g. Calculator) receive the correct input.
///
/// Args: {"code":Int, "modifiers":["cmd","shift","ctrl","opt"]}
///   - code:      Virtual key code (e.g. 0 = 'a', 36 = Return).
///   - modifiers: Optional array of modifier names.
func handleKey(_ args: [String: Any]) {
    guard let code = args["code"] as? Int else {
        fail("key: missing required 'code' integer argument")
    }

    let modifiers = args["modifiers"] as? [String] ?? []

    guard let keyDown = CGEvent(keyboardEventSource: nil, virtualKey: UInt16(code), keyDown: true),
          let keyUp = CGEvent(keyboardEventSource: nil, virtualKey: UInt16(code), keyDown: false) else {
        fail("key: failed to create CGEvent")
    }

    applyModifiers(keyDown, modifiers)
    applyModifiers(keyUp, modifiers)

    // Populate Unicode character data for apps that rely on it (e.g. Calculator)
    if let character = translateKeyCode(UInt16(code), modifierFlags: keyDown.flags) {
        var utf16 = Array(character.utf16)
        keyDown.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: &utf16)
        keyUp.keyboardSetUnicodeString(stringLength: utf16.count, unicodeString: &utf16)
    }

    keyDown.post(tap: .cghidEventTap)
    keyUp.post(tap: .cghidEventTap)

    outputJSON(["success": true])
}

// MARK: - Scroll Command Handler

/// Handle the "scroll" command.
///
/// Moves the cursor to the target position, then dispatches a scroll wheel event.
///
/// Args: {"x":Int, "y":Int, "dx":Int, "dy":Int}
///   - x, y:   Screen coordinates to scroll at.
///   - dx, dy: Horizontal and vertical scroll deltas in pixels.
func handleScroll(_ args: [String: Any]) {
    let x = requireCGFloat(args, key: "x", command: "scroll")
    let y = requireCGFloat(args, key: "y", command: "scroll")
    let dx = args["dx"] as? Int ?? 0
    let dy = args["dy"] as? Int ?? 0
    let point = CGPoint(x: x, y: y)

    // Move cursor to the target position first
    guard let moveEvent = CGEvent(
        mouseEventSource: nil,
        mouseType: .mouseMoved,
        mouseCursorPosition: point,
        mouseButton: .left
    ) else {
        fail("scroll: failed to create mouse move event")
    }
    moveEvent.post(tap: .cghidEventTap)

    // Create and post scroll wheel event
    guard let scrollEvent = CGEvent(
        scrollWheelEvent2Source: nil,
        units: .pixel,
        wheelCount: 2,
        wheel1: Int32(dy),
        wheel2: Int32(dx),
        wheel3: 0
    ) else {
        fail("scroll: failed to create scroll wheel event")
    }
    scrollEvent.post(tap: .cghidEventTap)

    var result: [String: Any] = ["success": true]
    if let warning = offScreenWarning(x: x, y: y) {
        result["warning"] = warning
    }
    outputJSON(result)
}

// MARK: - Drag Command Handler

/// Minimum number of intermediate steps for a smooth drag path.
private let minDragSteps = 10

/// Handle the "drag" command.
///
/// Performs a left-button drag from (sx, sy) to (ex, ey) over the given duration.
///
/// Args: {"sx":Int, "sy":Int, "ex":Int, "ey":Int, "duration":500}
///   - sx, sy:    Start coordinates.
///   - ex, ey:    End coordinates.
///   - duration:  Total drag time in milliseconds (default 500).
func handleDrag(_ args: [String: Any]) {
    let sx = requireCGFloat(args, key: "sx", command: "drag")
    let sy = requireCGFloat(args, key: "sy", command: "drag")
    let ex = requireCGFloat(args, key: "ex", command: "drag")
    let ey = requireCGFloat(args, key: "ey", command: "drag")
    let duration = args["duration"] as? Int ?? 500

    let startPoint = CGPoint(x: sx, y: sy)
    let endPoint = CGPoint(x: ex, y: ey)

    // Press the left mouse button at the start position
    guard let downEvent = CGEvent(
        mouseEventSource: nil,
        mouseType: .leftMouseDown,
        mouseCursorPosition: startPoint,
        mouseButton: .left
    ) else {
        fail("drag: failed to create mouse down event")
    }
    downEvent.post(tap: .cghidEventTap)

    // Interpolate intermediate points along the drag path
    let steps = max(minDragSteps, Int(max(abs(ex - sx), abs(ey - sy)) / 10))
    let sleepPerStep = UInt32(duration * 1000 / steps)

    for i in 1...steps {
        let t = CGFloat(i) / CGFloat(steps)
        let ix = sx + (ex - sx) * t
        let iy = sy + (ey - sy) * t
        let intermediatePoint = CGPoint(x: ix, y: iy)

        guard let dragEvent = CGEvent(
            mouseEventSource: nil,
            mouseType: .leftMouseDragged,
            mouseCursorPosition: intermediatePoint,
            mouseButton: .left
        ) else {
            fail("drag: failed to create mouse drag event at step \(i)")
        }
        dragEvent.post(tap: .cghidEventTap)

        usleep(sleepPerStep)
    }

    // Release the left mouse button at the end position
    guard let upEvent = CGEvent(
        mouseEventSource: nil,
        mouseType: .leftMouseUp,
        mouseCursorPosition: endPoint,
        mouseButton: .left
    ) else {
        fail("drag: failed to create mouse up event")
    }
    upEvent.post(tap: .cghidEventTap)

    var result: [String: Any] = ["success": true]
    // Check both start and end points
    var warnings: [String] = []
    if let w = offScreenWarning(x: sx, y: sy) { warnings.append("start: \(w)") }
    if let w = offScreenWarning(x: ex, y: ey) { warnings.append("end: \(w)") }
    if !warnings.isEmpty {
        result["warning"] = warnings.joined(separator: "; ")
    }
    outputJSON(result)
}

// MARK: - Secure Input Status Handler

/// Handle the "secure" command.
///
/// Checks whether secure event input is currently enabled (e.g., password fields).
///
/// Args: {} (none required)
/// Returns: {"success":true, "secure":true|false}
func handleSecure() {
    let isSecure = IsSecureEventInputEnabled()
    outputJSON(["success": true, "secure": isSecure])
}

// MARK: - Display Info Handler

/// Handle the "display_info" command.
///
/// Queries all active displays via CGDisplayBounds (logical points — same
/// coordinate system as CGEvent) and the display scale factor.
///
/// Args: {} (none required)
/// Returns: {"success":true, "displays":[{name, width, height, x, y, scaleFactor}]}
/// Maximum number of displays to query from CGGetActiveDisplayList.
private let maxDisplayCount: UInt32 = 32

func handleDisplayInfo() {
    var displayIDs = [CGDirectDisplayID](repeating: 0, count: Int(maxDisplayCount))
    var displayCount: UInt32 = 0
    CGGetActiveDisplayList(maxDisplayCount, &displayIDs, &displayCount)

    var displays: [[String: Any]] = []
    for i in 0..<Int(displayCount) {
        let id = displayIDs[i]
        let bounds = CGDisplayBounds(id)

        var scaleFactor = 1
        if let mode = CGDisplayCopyDisplayMode(id) {
            let pw = mode.pixelWidth
            scaleFactor = Int(round(Double(pw) / Double(bounds.size.width)))
        }

        displays.append([
            "name": CGDisplayIsBuiltin(id) != 0 ? "Built-in Display" : "External Display",
            "width": Int(bounds.size.width),
            "height": Int(bounds.size.height),
            "x": Int(bounds.origin.x),
            "y": Int(bounds.origin.y),
            "scaleFactor": scaleFactor,
        ])
    }

    outputJSON(["success": true, "displays": displays])
}

// MARK: - Window Enumeration Handler

/// Handle the "list_windows" command.
///
/// Uses CGWindowListCopyWindowInfo for robust window enumeration.
/// Returns real CGWindowIDs that work with screencapture -l.
///
/// Args: {"app":"optional filter"}
/// Returns: {"success":true, "windows":[{app, title, id, x, y, width, height, minimized}]}
func handleListWindows(_ args: [String: Any]) {
    let filterApp = args["app"] as? String

    guard let windowList = CGWindowListCopyWindowInfo(
        [.optionAll, .excludeDesktopElements],
        kCGNullWindowID
    ) as? [[String: Any]] else {
        outputJSON(["success": true, "windows": []])
        return
    }

    var windows: [[String: Any]] = []

    for window in windowList {
        guard let ownerName = window[kCGWindowOwnerName as String] as? String,
              let windowNumber = window[kCGWindowNumber as String] as? Int,
              let bounds = window[kCGWindowBounds as String] as? [String: Any] else {
            continue
        }

        // Only include normal windows (layer 0)
        let layer = window[kCGWindowLayer as String] as? Int ?? -1
        if layer != 0 { continue }

        guard let x = bounds["X"] as? Double,
              let y = bounds["Y"] as? Double,
              let width = bounds["Width"] as? Double,
              let height = bounds["Height"] as? Double else {
            continue
        }

        // Skip tiny/invisible windows (below 10×10 are system artifacts)
        if width < 10 || height < 10 { continue }

        // Apply app filter
        if let filter = filterApp, ownerName != filter { continue }

        let title = window[kCGWindowName as String] as? String ?? ""

        // When no app filter: skip empty-title windows (system services)
        if filterApp == nil && title.isEmpty { continue }

        let isOnscreen = window[kCGWindowIsOnscreen as String] as? Bool ?? false

        windows.append([
            "app": ownerName,
            "title": title,
            "id": windowNumber,
            "x": Int(x),
            "y": Int(y),
            "width": Int(width),
            "height": Int(height),
            "minimized": !isOnscreen,
        ])
    }

    outputJSON(["success": true, "windows": windows])
}

// MARK: - Screenshot Helpers

/// Resize a CGImage to the given dimensions using high-quality interpolation.
///
/// Returns the original image unchanged if newWidth/newHeight match the input.
func resizeImage(_ image: CGImage, newWidth: Int, newHeight: Int) -> CGImage {
    if image.width == newWidth && image.height == newHeight {
        return image
    }

    let colorSpace = CGColorSpaceCreateDeviceRGB()
    let bitmapInfo = CGImageAlphaInfo.premultipliedFirst.rawValue
        | CGBitmapInfo.byteOrder32Little.rawValue

    guard let context = CGContext(
        data: nil,
        width: newWidth,
        height: newHeight,
        bitsPerComponent: 8,
        bytesPerRow: 0,
        space: colorSpace,
        bitmapInfo: bitmapInfo
    ) else {
        fail("screenshot: failed to create resize context")
    }

    context.interpolationQuality = .high
    context.draw(image, in: CGRect(x: 0, y: 0, width: newWidth, height: newHeight))

    guard let resized = context.makeImage() else {
        fail("screenshot: failed to create resized image")
    }
    return resized
}

/// Compute the logical bounding box of all active displays.
///
/// Returns the union of all display bounds in logical points — the same
/// coordinate system as CGEvent and CGWindowListCopyWindowInfo.
func logicalScreenBounds() -> CGRect {
    var displayIDs = [CGDirectDisplayID](repeating: 0, count: Int(maxDisplayCount))
    var count: UInt32 = 0
    CGGetActiveDisplayList(maxDisplayCount, &displayIDs, &count)

    var union = CGRect.null
    for i in 0..<Int(count) {
        union = union.union(CGDisplayBounds(displayIDs[i]))
    }
    return union
}

/// Encode a CGImage to PNG or JPEG data using ImageIO.
func encodeImage(_ image: CGImage, format: String) -> Data {
    let uti: CFString = format == "jpeg"
        ? "public.jpeg" as CFString
        : "public.png" as CFString
    let imageData = NSMutableData()

    guard let destination = CGImageDestinationCreateWithData(
        imageData, uti, 1, nil
    ) else {
        fail("screenshot: failed to create image destination")
    }

    CGImageDestinationAddImage(destination, image, nil)

    guard CGImageDestinationFinalize(destination) else {
        fail("screenshot: failed to finalize image encoding")
    }

    return imageData as Data
}

// MARK: - Screenshot Command Handler

/// Handle the "screenshot" command.
///
/// Captures a screenshot using CGWindowListCreateImage and normalizes the
/// output to logical pixels (matching screen coordinates). On macOS versions
/// where CGWindowListCreateImage returns Retina (2x) pixels, the image is
/// downscaled to logical resolution automatically.
///
/// Args: {"mode":"full"|"region"|"window", "x":Int, "y":Int, "w":Int, "h":Int,
///        "window_title":"...", "max_dimension":0, "format":"png"|"jpeg"}
func handleScreenshot(_ args: [String: Any]) {
    let mode = args["mode"] as? String ?? "full"
    let maxDimension = args["max_dimension"] as? Int ?? 0
    let format = args["format"] as? String ?? "png"

    var capturedImage: CGImage?
    var originX: CGFloat = 0
    var originY: CGFloat = 0
    // Expected logical size — used to detect and correct Retina captures
    var expectedLogicalWidth: CGFloat = 0
    var expectedLogicalHeight: CGFloat = 0

    switch mode {
    case "full":
        capturedImage = CGWindowListCreateImage(
            .infinite,
            .optionOnScreenOnly,
            kCGNullWindowID,
            []
        )
        let screenBounds = logicalScreenBounds()
        originX = screenBounds.origin.x
        originY = screenBounds.origin.y
        expectedLogicalWidth = screenBounds.size.width
        expectedLogicalHeight = screenBounds.size.height

    case "region":
        let rx = requireCGFloat(args, key: "x", command: "screenshot")
        let ry = requireCGFloat(args, key: "y", command: "screenshot")
        let rw = requireCGFloat(args, key: "w", command: "screenshot")
        let rh = requireCGFloat(args, key: "h", command: "screenshot")
        let rect = CGRect(x: rx, y: ry, width: rw, height: rh)
        originX = rx
        originY = ry
        expectedLogicalWidth = rw
        expectedLogicalHeight = rh
        capturedImage = CGWindowListCreateImage(
            rect,
            .optionOnScreenOnly,
            kCGNullWindowID,
            []
        )

    case "window":
        guard let windowTitle = args["window_title"] as? String,
              !windowTitle.isEmpty else {
            fail("screenshot: missing required 'window_title' for window mode")
        }

        guard let windowList = CGWindowListCopyWindowInfo(
            [.optionAll, .excludeDesktopElements],
            kCGNullWindowID
        ) as? [[String: Any]] else {
            fail("screenshot: failed to enumerate windows")
        }

        let titleLower = windowTitle.lowercased()
        var foundWindowID: CGWindowID?
        var foundBounds: CGRect?

        for window in windowList {
            guard let ownerName = window[kCGWindowOwnerName as String] as? String,
                  let windowNumber = window[kCGWindowNumber as String] as? Int,
                  let bounds = window[kCGWindowBounds as String] as? [String: Any]
            else {
                continue
            }

            let layer = window[kCGWindowLayer as String] as? Int ?? -1
            if layer != 0 { continue }

            let title = window[kCGWindowName as String] as? String ?? ""

            // Case-insensitive substring match on title or owner name
            if title.lowercased().contains(titleLower)
                || ownerName.lowercased().contains(titleLower)
            {
                guard let bx = bounds["X"] as? Double,
                      let by = bounds["Y"] as? Double,
                      let bw = bounds["Width"] as? Double,
                      let bh = bounds["Height"] as? Double else {
                    continue
                }
                if bw < 1 || bh < 1 { continue }

                foundWindowID = CGWindowID(windowNumber)
                foundBounds = CGRect(x: bx, y: by, width: bw, height: bh)
                break
            }
        }

        guard let windowID = foundWindowID, let windowBounds = foundBounds else {
            fail("screenshot: no window found matching '\(windowTitle)'")
        }

        originX = windowBounds.origin.x
        originY = windowBounds.origin.y
        expectedLogicalWidth = windowBounds.size.width
        expectedLogicalHeight = windowBounds.size.height

        capturedImage = CGWindowListCreateImage(
            .null,
            .optionIncludingWindow,
            windowID,
            []
        )

    default:
        fail("screenshot: unknown mode '\(mode)' — expected full, region, or window")
    }

    guard let rawImage = capturedImage else {
        fail("screenshot: CGWindowListCreateImage returned nil — Screen Recording permission may be required")
    }

    // Normalize to logical pixels. On some macOS versions (15+),
    // CGWindowListCreateImage returns Retina-resolution images even without
    // .bestResolution. Detect this by comparing captured size to expected
    // logical size, and downscale if needed.
    var logicalImage = rawImage
    let logicalW = Int(expectedLogicalWidth)
    let logicalH = Int(expectedLogicalHeight)

    if logicalW > 0 && logicalH > 0
        && (rawImage.width > logicalW || rawImage.height > logicalH)
    {
        logicalImage = resizeImage(rawImage, newWidth: logicalW, newHeight: logicalH)
    }

    // The "logical size" is what we use for coordinate math from here on
    let logicalWidth = logicalImage.width
    let logicalHeight = logicalImage.height

    // Apply max_dimension resize on top of the logical image
    var outputImage = logicalImage
    if maxDimension > 0 && max(logicalWidth, logicalHeight) > maxDimension {
        let scale = CGFloat(maxDimension) / CGFloat(max(logicalWidth, logicalHeight))
        let newWidth = Int(CGFloat(logicalWidth) * scale)
        let newHeight = Int(CGFloat(logicalHeight) * scale)
        outputImage = resizeImage(logicalImage, newWidth: newWidth, newHeight: newHeight)
    }

    let outputWidth = outputImage.width
    let outputHeight = outputImage.height

    // Encode to PNG or JPEG
    let encoded = encodeImage(outputImage, format: format)

    // Compute scale factors for coordinate mapping.
    // scale converts image pixels to logical screen offsets:
    //   screen_x = origin_x + image_x * scale_x
    var scaleX: Double = 1.0
    var scaleY: Double = 1.0
    if logicalWidth != outputWidth || logicalHeight != outputHeight {
        scaleX = Double(logicalWidth) / Double(outputWidth)
        scaleY = Double(logicalHeight) / Double(outputHeight)
    }

    var result: [String: Any] = [
        "success": true,
        "width": outputWidth,
        "height": outputHeight,
        "origin_x": Double(originX),
        "origin_y": Double(originY),
        "scale_x": scaleX,
        "scale_y": scaleY,
    ]

    if let outputPath = args["output_path"] as? String {
        let url = URL(fileURLWithPath: outputPath)
        do {
            try encoded.write(to: url)
        } catch {
            fail("screenshot: failed to write image to \(outputPath) — \(error.localizedDescription)")
        }
    } else {
        result["base64"] = encoded.base64EncodedString()
    }

    outputJSON(result)
}

// MARK: - Accessibility UI Elements Handler

/// Maximum number of elements to return from a single get_ui_elements query.
/// Capped to prevent excessive output that would overwhelm LLM context windows.
private let maxUIElements = 50

/// Traverse the AX tree in breadth-first order, collecting element metadata.
///
/// Filters by role and title when specified. Stops when `maxUIElements` is
/// reached or the tree is exhausted up to `maxDepth` levels.
///
/// - Parameters:
///   - root: The root AXUIElement (typically an application element).
///   - maxDepth: Maximum tree traversal depth.
///   - roleFilter: Optional AX role string to match exactly (e.g. "AXButton").
///   - titleFilter: Optional case-insensitive substring to match against title or description.
/// - Returns: Array of element dictionaries with role, title, position, size, and states.
func collectUIElements(
    root: AXUIElement,
    maxDepth: Int,
    roleFilter: String?,
    titleFilter: String?
) -> [[String: Any]] {
    var results: [[String: Any]] = []
    var queue: [(element: AXUIElement, depth: Int)] = [(root, 0)]

    while !queue.isEmpty && results.count < maxUIElements {
        let (element, depth) = queue.removeFirst()
        if depth > maxDepth { continue }

        // Extract role
        var roleRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &roleRef)
        let role = roleRef as? String ?? ""

        // Extract title
        var titleRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXTitleAttribute as CFString, &titleRef)
        let title = titleRef as? String

        // Fallback: AXDescription
        var descRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXDescriptionAttribute as CFString, &descRef)
        let axDescription = descRef as? String

        // Extract value
        var valueRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &valueRef)
        let value = valueRef as? String

        // Extract position
        var positionRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXPositionAttribute as CFString, &positionRef)
        var position = CGPoint.zero
        if let positionValue = positionRef {
            AXValueGetValue(positionValue as! AXValue, .cgPoint, &position)
        }

        // Extract size
        var sizeRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXSizeAttribute as CFString, &sizeRef)
        var size = CGSize.zero
        if let sizeValue = sizeRef {
            AXValueGetValue(sizeValue as! AXValue, .cgSize, &size)
        }

        // Extract enabled state
        var enabledRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXEnabledAttribute as CFString, &enabledRef)
        let enabled = enabledRef as? Bool ?? true

        // Extract focused state
        var focusedRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXFocusedAttribute as CFString, &focusedRef)
        let focused = focusedRef as? Bool ?? false

        // Apply filters
        let displayTitle = title ?? axDescription
        let passesRoleFilter = roleFilter == nil || role == roleFilter
        let passesTitleFilter = titleFilter == nil ||
            (displayTitle?.lowercased().contains(titleFilter!.lowercased()) ?? false)

        // Include element if it has a meaningful role and passes all filters
        if !role.isEmpty && passesRoleFilter && passesTitleFilter {
            var entry: [String: Any] = [
                "role": role,
                "position": ["x": Int(position.x), "y": Int(position.y)],
                "size": ["width": Int(size.width), "height": Int(size.height)],
                "enabled": enabled,
                "focused": focused,
            ]
            if let t = displayTitle, !t.isEmpty {
                entry["title"] = t
            }
            if let v = value, !v.isEmpty {
                entry["value"] = v
            }
            results.append(entry)
        }

        // Enqueue children for BFS traversal
        if depth < maxDepth {
            var childrenRef: CFTypeRef?
            AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenRef)
            if let children = childrenRef as? [AXUIElement] {
                for child in children {
                    queue.append((child, depth + 1))
                }
            }
        }
    }

    return results
}

/// Handle the "get_ui_elements" command.
///
/// Queries visible UI elements of an application via the macOS Accessibility API.
/// Uses BFS traversal with optional role and title filters.
///
/// Args: {"app":"optional", "role":"AXButton", "title":"substring", "max_depth":5}
func handleGetUIElements(_ args: [String: Any]) {
    let appName = args["app"] as? String
    let roleFilter = args["role"] as? String
    let titleFilter = args["title"] as? String
    let maxDepth = args["max_depth"] as? Int ?? 5

    // Resolve PID: fuzzy match against running apps, or use frontmost
    let pid: pid_t
    if let name = appName {
        let apps = NSWorkspace.shared.runningApplications.filter {
            $0.activationPolicy == .regular
        }
        let nameLower = name.lowercased()

        let match = apps.first(where: { ($0.localizedName ?? "").lowercased() == nameLower })
            ?? apps.first(where: { ($0.localizedName ?? "").lowercased().hasPrefix(nameLower) })
            ?? apps.first(where: { ($0.localizedName ?? "").lowercased().contains(nameLower) })

        guard let app = match else {
            fail("get_ui_elements: no running application found matching '\(name)'")
        }
        pid = app.processIdentifier
    } else {
        guard let frontmost = NSWorkspace.shared.frontmostApplication else {
            fail("get_ui_elements: no frontmost application found")
        }
        pid = frontmost.processIdentifier
    }

    let appElement = AXUIElementCreateApplication(pid)
    let elements = collectUIElements(
        root: appElement,
        maxDepth: maxDepth,
        roleFilter: roleFilter,
        titleFilter: titleFilter
    )

    outputJSON([
        "success": true,
        "elements": elements,
        "count": elements.count,
    ])
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
case "type":
    handleType(args)
case "key":
    handleKey(args)
case "scroll":
    handleScroll(args)
case "drag":
    handleDrag(args)
case "secure":
    handleSecure()
case "display_info":
    handleDisplayInfo()
case "list_windows":
    handleListWindows(args)
case "screenshot":
    handleScreenshot(args)
case "get_ui_elements":
    handleGetUIElements(args)
default:
    fail("unknown command: \(command)")
}
