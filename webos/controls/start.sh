#!/bin/sh
# Copy as an optional webOSbrew init hook after installing the controls files and target-app-id.
set -eu
BASE=${1:-/var/lib/webosbrew/lg-controls}
PIDFILE=/run/freemytv-disney.pid
[ -s "$BASE/target-app-id" ] && [ -f "$BASE/mapping.js" ] && [ -x "$BASE/watch.sh" ] || exit 1
if [ -r "$PIDFILE" ]; then
    pid=$(cat "$PIDFILE")
    case "$pid" in
        ''|*[!0-9]*) ;;
        *) if kill -0 "$pid" 2>/dev/null && grep -F -q "$BASE/watch.sh" "/proc/$pid/cmdline"; then exit 0; fi ;;
    esac
fi
nohup /bin/sh "$BASE/watch.sh" "$BASE" </dev/null > "$BASE/watch.log" 2>&1 &
printf '%s\n' "$!" > "$PIDFILE"
