#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
work=$(mktemp -d /tmp/freemytv-calendar-tests.XXXXXX)
trap 'rm -rf "$work"' EXIT HUP INT TERM
xcrun swiftc -swift-version 6 tools/calendar-export/Policy.swift tests/calendar-policy.swift -o "$work/policy-test"
"$work/policy-test"
tools/build-calendar-export.sh "$work/TVCalendarBridge.app"
codesign --verify --strict "$work/TVCalendarBridge.app"
echo 'Calendar exporter build and policy checks passed; no calendars requested in CI.'
