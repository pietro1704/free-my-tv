#!/usr/bin/env bash
# What CI runs on every pull request (.github/workflows/check.yml). Run it before you push:
#
#   tools/check.sh           # everything
#   tools/check.sh android   # only the Google TV build (needs what build.sh needs)
#   tools/check.sh web       # translations, the LG and Samsung packages, and ES5 (needs Python 3 and Node)
#
# One difference: here ./build.sh uses the newest SDK and JDK you have, while CI uses build-tools 34, android-34 and
# JDK 17, as the README says. A call newer than Android 34 can pass here and fail on the pull request.
set -euo pipefail
cd "$(dirname "$0")/.."
what="${1:-all}"
case "$what" in
  all|android|web) ;;
  *) echo "Usage: tools/check.sh [all|android|web]" >&2; exit 2 ;;
esac

if [ "$what" = all ] || [ "$what" = android ]; then
  ./build.sh
fi

if [ "$what" = all ] || [ "$what" = web ]; then
  node --test tests/web-profile.test.cjs
  node --test tests/homelab.test.cjs
  node --test tests/idle.test.cjs
  node --test tests/provider-picks.test.cjs
  node --test tests/widgets.test.cjs
  node --test tests/news-feed.test.cjs
  node --test tests/youtube-feed.test.cjs
  node --test tests/calendar-feed.test.cjs
  node --test tests/nuvio-source.test.cjs
  node --test tests/media-cards.test.cjs
  node --test tests/dashboard.test.cjs
  node --test tests/disney-mapping.test.cjs
  node --test tests/native-saver.test.cjs
  sh -n webos/controls/start.sh
  sh -n webos/controls/watch.sh
  sh -n webos/controls/native-saver.sh
  python3 tests/webapp-config.test.py
  python3 tools/translate.py --check

  # The generic LG and Samsung packages land where your own build leaves yours (with your city and TMDB key):
  # keep yours and put them back afterwards, so the next install isn't the generic one.
  packages="FreeMyTV-webos.ipk FreeMyTV-tizen.wgt"
  kept="$(mktemp -d)"
  for p in $packages; do if [ -f "$p" ]; then cp "$p" "$kept/"; fi; done
  trap 'for p in $packages; do if [ -f "$kept/$p" ]; then mv "$kept/$p" "$p"; else rm -f "$p"; fi; done; rm -rf "$kept"' EXIT
  python3 webos/build.py --generic
  python3 tizen/build.py --generic

  # webOS 3 and Tizen 3 run a Chromium from 2015 to 2017: web/ has to be ES5, in syntax...
  for f in web/*.js; do npx --yes acorn@8.14.0 --ecma5 --silent "$f"; done
  # ...and in what it calls. These parse fine but don't exist there (wrap a feature check in try, as strings.js does).
  if grep -nE '\.(includes|startsWith|endsWith|padStart|padEnd|repeat|find|findIndex|closest)\(|Object\.(assign|entries|values)\(|Array\.from\(|\bPromise\b|\bfetch\(|new (Map|Set|WeakMap)\b' web/*.js; then
    echo "web/ calls something older TVs don't have (above)." >&2
    exit 1
  fi
fi

echo "All checks passed."
