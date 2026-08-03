#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

LOCAL_VERSION=$(node -e "console.log(require('./app.json').expo.version)")

echo "Checking last shipped version on EAS..."
LAST_VERSION=$(eas build:list --platform ios --status finished --limit 1 --json --non-interactive 2>/dev/null \
  | node -e "
let d='';
process.stdin.on('data', c => d += c);
process.stdin.on('end', () => {
  try {
    const j = JSON.parse(d);
    const arr = Array.isArray(j) ? j : (j.builds || []);
    console.log(arr[0] && arr[0].appVersion ? arr[0].appVersion : '');
  } catch (e) {
    console.log('');
  }
});
")

if [[ -n "$LAST_VERSION" ]]; then
  HIGHEST=$(printf '%s\n%s\n' "$LOCAL_VERSION" "$LAST_VERSION" | sort -V | tail -1)
  if [[ "$LOCAL_VERSION" == "$LAST_VERSION" || "$HIGHEST" != "$LOCAL_VERSION" ]]; then
    echo "" >&2
    echo "ERROR: app.json \"version\" ($LOCAL_VERSION) is not higher than the last EAS build's version ($LAST_VERSION)." >&2
    echo "Apple closes a version's pre-release train once a build for it is approved, so re-submitting the" >&2
    echo "same version fails with ITMS-90186/ITMS-90062. Bump \"version\" in mobile/app.json before shipping." >&2
    echo "" >&2
    exit 1
  fi
  echo "Version check passed: $LOCAL_VERSION > $LAST_VERSION"
else
  echo "Warning: could not determine last shipped version from EAS; skipping version check." >&2
fi

echo "Building for App Store..."
eas build --platform ios --profile production --non-interactive

echo "Submitting to App Store Connect..."
eas submit --platform ios --profile production --latest --non-interactive

echo "Done."
