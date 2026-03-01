#!/bin/bash
set -euo pipefail

mkdir -p dist/bin

# Target macOS 13 (Ventura) — the project's minimum supported version.
# This also suppresses the "obsoleted" error for CGWindowListCreateImage
# on macOS 15+ SDKs, where the API is deprecated but still functional.

# Compile for both architectures
swiftc swift/input-helper.swift \
  -o dist/bin/input-helper-arm64 \
  -O \
  -target arm64-apple-macos13.0

swiftc swift/input-helper.swift \
  -o dist/bin/input-helper-x86_64 \
  -O \
  -target x86_64-apple-macos13.0

# Combine into universal binary
lipo -create -output dist/bin/input-helper \
  dist/bin/input-helper-arm64 \
  dist/bin/input-helper-x86_64

# Clean up architecture-specific binaries
rm dist/bin/input-helper-arm64 dist/bin/input-helper-x86_64

chmod +x dist/bin/input-helper
echo "Swift helper compiled successfully (universal binary: arm64 + x86_64)"
