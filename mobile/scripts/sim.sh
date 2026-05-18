#!/usr/bin/env zsh
set -euo pipefail

cd "$(dirname "$0")/.."

# Ensure expo-dev-client is in package.json
if ! grep -q '"expo-dev-client"' package.json; then
  echo "Installing expo-dev-client..."
  npx expo install expo-dev-client
fi

# Generate native iOS project if it doesn't exist yet
if [[ ! -d ios ]]; then
  echo "No ios/ directory found — running expo prebuild..."
  npx expo prebuild --platform ios
fi

# Ensure pods are installed/synced
if ! grep -q "EXDevLauncher" ios/Podfile.lock 2>/dev/null; then
  echo "Syncing CocoaPods..."
  (cd ios && pod install)
fi

# ---- Build target list ----
# Entry format: "type|udid|label"
#   type: Booted | Shutdown  → simulator
#         device             → physical device (USB, free)
#         testflight         → EAS cloud build → TestFlight (uses build credits)

entries=()

# Physical devices connected via USB
# UDIDs for real devices are 8HEX-16HEX (e.g. 00008110-000A7C843629801E)
# Simulators use standard UUID format (8-4-4-4-12) — filtered out here
while IFS= read -r line; do
  name=$(echo "$line" | sed -E 's/ \([^)]+\) \([0-9A-F]{8}-[0-9A-F]{16}\)$//')
  udid=$(echo "$line" | grep -oE '[0-9A-F]{8}-[0-9A-F]{16}')
  [[ -z "$udid" ]] && continue
  entries+=("device|$udid|$name [USB]")
done < <(
  xcrun xctrace list devices 2>/dev/null \
    | grep -E "\([0-9A-F]{8}-[0-9A-F]{16}\)"
)

# Simulators: booted first
while IFS= read -r line; do
  entries+=("$line")
done < <(
  xcrun simctl list devices available \
    | grep -E "\([0-9A-F-]{36}\)" \
    | sed -E 's/^[[:space:]]*(.*) \(([0-9A-F-]{36})\) \((Booted|Shutdown)\).*/\3|\2|\1 [Sim]/' \
    | sort -r
)

# TestFlight via EAS (uses build credits)
entries+=("testflight||TestFlight via EAS cloud build  ⚠ uses build credits")

if [ ${#entries[@]} -eq 0 ]; then
  echo "No devices or simulators found."
  exit 1
fi

echo ""
echo "Select a target:"
echo ""
for i in {1..${#entries[@]}}; do
  IFS='|' read -r type udid label <<< "${entries[$i]}"
  marker=""
  [[ "$type" == "Booted" ]] && marker=" *"
  printf "  %d) %s%s\n" $i "$label" "$marker"
done
echo ""
echo "  (* = simulator already running)"
echo ""
read "choice?Choice [1-${#entries[@]}]: "

if ! [[ "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > ${#entries[@]} )); then
  echo "Invalid choice."
  exit 1
fi

IFS='|' read -r type udid label <<< "${entries[$choice]}"

# ---- TestFlight path — EAS cloud build ----
if [[ "$type" == "testflight" ]]; then
  echo ""
  echo "Starting EAS cloud build and submitting to TestFlight..."
  echo "This uses your EAS build credits."
  echo ""
  eas build -p ios --profile development --submit
  echo ""
  echo "Done. You'll get an email when the build is available in TestFlight."
  echo "After installing, open the app and connect to Metro:"
  echo "  npx expo start --dev-client"
  exit 0
fi

# ---- Physical device path — local Xcode build over USB ----
if [[ "$type" == "device" ]]; then
  echo ""
  echo "Building and installing on: $label ($udid)"
  echo "No build credits used — builds locally with Xcode."
  echo ""
  npx expo run:ios --udid "$udid"
  exit 0
fi

# ---- Simulator path — local Xcode build ----
bundle_id=$(node -e "console.log(require('./app.json').expo.ios.bundleIdentifier)")

echo ""
echo "Deploying to: $label ($udid)"
echo ""

# Remove stale install
xcrun simctl uninstall "$udid" "$bundle_id" 2>/dev/null || true

# Workspace and scheme
workspace=$(find ios -name "*.xcworkspace" -maxdepth 1 | head -1)
scheme=$(basename "$workspace" .xcworkspace)

# Clean build if DerivedData is missing or Podfile.lock changed
derived_app=$(find ~/Library/Developer/Xcode/DerivedData -name "${scheme}.app" -path "*/Debug-iphonesimulator/*" 2>/dev/null | head -1)
build_args=(-workspace "$workspace" -configuration Debug -scheme "$scheme" -destination "id=$udid")
if [[ -z "$derived_app" || ios/Podfile.lock -nt "$derived_app" ]]; then
  echo "Native dependencies changed — clearing DerivedData..."
  rm -rf ~/Library/Developer/Xcode/DerivedData/${scheme}-*(N)
  build_args+=(clean)
fi
build_args+=(build)

echo "Building..."
if command -v xcpretty > /dev/null 2>&1; then
  RCT_NO_LAUNCH_PACKAGER=true xcodebuild "${build_args[@]}" 2>&1 | xcpretty
else
  RCT_NO_LAUNCH_PACKAGER=true xcodebuild "${build_args[@]}" > /tmp/fressh-build.log 2>&1 || {
    echo "Build failed. Log: /tmp/fressh-build.log"
    exit 1
  }
  echo "Build succeeded"
fi

# Install built app onto the chosen simulator
built_app=$(find ~/Library/Developer/Xcode/DerivedData -name "${scheme}.app" -path "*/Debug-iphonesimulator/*" 2>/dev/null | head -1)
if [[ -z "$built_app" ]]; then
  echo "No .app found after build."
  exit 1
fi
echo "Installing on $label..."
xcrun simctl install "$udid" "$built_app"

# Kill any stale Metro on port 8081
lsof -ti tcp:8081 | xargs kill -9 2>/dev/null || true

# Open the app once Metro is ready
(
  until curl -sf http://localhost:8081/status > /dev/null 2>&1; do sleep 1; done
  echo "Opening on $label..."
  xcrun simctl openurl "$udid" "${bundle_id}://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
) &

# Start Metro in the foreground (Ctrl+C to stop)
npx expo start --dev-client
