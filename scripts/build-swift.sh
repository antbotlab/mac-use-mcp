#!/bin/bash
set -euo pipefail

mkdir -p dist/bin
swiftc swift/input-helper.swift -o dist/bin/input-helper -O
chmod +x dist/bin/input-helper
echo "Swift helper compiled successfully"
