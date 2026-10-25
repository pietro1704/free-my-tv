#!/bin/sh
set -eu
BASE=${FREEMYTV_CONTROLS_DIR:-/var/lib/webosbrew/lg-controls}
work=$(mktemp -d /tmp/freemytv-native-saver.XXXXXX)
cleanup() {
    exec 3>&-
    rm -f "$work/input"
    rmdir "$work" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' HUP INT TERM
mkfifo "$work/input"
# This firmware ends luna-send on stdin EOF, including non-interactive calls.
exec 3<>"$work/input"
node "$BASE/native-saver.js" "${1:-invalid}" <&3
