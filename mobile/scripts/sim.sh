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

# Parse simulators: "Booted|UDID|Name", booted first
devices=()
while IFS= read -r line; do
  devices+=("$line")
done < <(
  xcrun simctl list devices available \
    | grep -E "\([0-9A-F-]{36}\)" \
    | sed -E 's/^[[:space:]]*(.*) \(([0-9A-F-]{36})\) \((Booted|Shutdown)\).*/\3|\2|\1/' \
    | sort -r
)

if [ ${#devices[@]} -eq 0 ]; then
  echo "No simulators found."
  exit 1
fi

echo ""
echo "Select a simulator:"
echo ""
for i in {1..${#devices[@]}}; do
  IFS='|' read -r state udid name <<< "${devices[$i]}"
  marker=""
  [[ "$state" == "Booted" ]] && marker=" *"
  printf "  %d) %s%s\n" $i "$name" "$marker"
done
echo ""
echo "  (* = already running)"
echo ""
read "choice?Choice [1-${#devices[@]}]: "

if ! [[ "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > ${#devices[@]} )); then
  echo "Invalid choice."
  exit 1
fi

IFS='|' read -r state udid name <<< "${devices[$choice]}"
bundle_id=$(node -e "console.log(require('./app.json').expo.ios.bundleIdentifier)")

echo ""
echo "Deploying to: $name ($udid)"
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
echo "Installing on $name..."
xcrun simctl install "$udid" "$built_app"

# Kill any stale Metro on port 8081
lsof -ti tcp:8081 | xargs kill -9 2>/dev/null || true

# Open the app once Metro is ready
(
  until curl -sf http://localhost:8081/status > /dev/null 2>&1; do sleep 1; done
  echo "Opening on $name..."
  xcrun simctl openurl "$udid" "${bundle_id}://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
) &

# Start Metro in the foreground (Ctrl+C to stop)
npx expo start --dev-client
