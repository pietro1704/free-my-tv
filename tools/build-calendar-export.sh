#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
[ "$#" -eq 1 ] || { echo 'Usage: tools/build-calendar-export.sh /private/path/TVCalendarBridge.app' >&2; exit 2; }
app=$1
case "$app" in /*.app) ;; *) exit 2 ;; esac
mkdir -p "$app/Contents/MacOS"
cp tools/calendar-export/Info.plist "$app/Contents/Info.plist"
xcrun swiftc -swift-version 6 tools/calendar-export/Policy.swift tools/calendar-export/main.swift -o "$app/Contents/MacOS/TVCalendarBridge" -framework Cocoa -framework EventKit
codesign --force --sign - --identifier io.freemytv.local-calendar-bridge "$app"
