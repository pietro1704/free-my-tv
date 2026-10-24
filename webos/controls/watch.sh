#!/bin/sh
# Subscribe to native setting changes. Node runs only for a notification, never per key press.
set -eu
BASE=${1:-/var/lib/webosbrew/lg-controls}
TARGET=$(cat "$BASE/target-app-id")
work=$(mktemp -d /tmp/freemytv-disney.XXXXXX)
subscriber=
cleanup() {
    if [ -n "$subscriber" ]; then
        kill "$subscriber" 2>/dev/null || true
        wait "$subscriber" 2>/dev/null || true
    fi
    exec 3>&-
    rm -f "$work/input" "$work/events"
    rmdir "$work" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' HUP INT TERM
mkfifo "$work/input" "$work/events"
# luna-send exits on stdin EOF. An open, idle FIFO avoids a pseudo-terminal or busy input loop.
exec 3<>"$work/input"
while :; do
    luna-send -i luna://com.webos.settingsservice/getSystemSettings \
        '{"category":"other","keys":["mapping_info"],"subscribe":true}' <&3 > "$work/events" &
    subscriber=$!
    while IFS= read -r event; do
        [ -n "$event" ] || continue
        if payload=$(printf '%s\n' "$event" | node "$BASE/mapping.js" "$TARGET"); then
            [ -n "$payload" ] || continue
            luna-send -n 1 luna://com.webos.settingsservice/setSystemSettings "$payload" <&3 >/dev/null
        else
            kill "$subscriber" 2>/dev/null || true
            break
        fi
    done < "$work/events"
    wait "$subscriber" 2>/dev/null || true
    subscriber=
    sleep 10 &
    subscriber=$!
    wait "$subscriber" 2>/dev/null || true
    subscriber=
done
