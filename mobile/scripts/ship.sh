#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Building for App Store..."
eas build --platform ios --profile production --non-interactive

echo "Submitting to App Store Connect..."
eas submit --platform ios --profile production --latest --non-interactive

echo "Done."
