#!/bin/bash
set -euo pipefail

mkdir -p dist/bin

# Target macOS 13 (Ventura) — the project's minimum supported version.
# This also suppresses the "obsoleted" error for CGWindowListCreateImage
# on macOS 15+ SDKs, where the API is deprecated but still functional.
swiftc swift/input-helper.swift \
  -o dist/bin/input-helper \
  -O \
  -target "$(uname -m)-apple-macos13.0"

chmod +x dist/bin/input-helper
echo "Swift helper compiled successfully"
