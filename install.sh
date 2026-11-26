#!/bin/sh
# M17.3: installs HeadlessOS on this Mac, for this account: the latest release, checked against its
# SHA-256, put in Applications and opened.
#
#   curl -fsSL https://raw.githubusercontent.com/abhee235/headlessos/main/install.sh | sh
#
# No administrator rights. Run it again to update HeadlessOS. Your servers and settings live in
# ~/.headlessos and ~/Library/Application Support, which this never touches.
#
# Files fetched with curl are not marked as downloaded from the internet, so macOS opens HeadlessOS
# without the first-launch steps. The SHA-256 check is what makes sure they are the release's own files.
# @see docs/phases/phase-17.md

set -eu

REPO="https://github.com/abhee235/headlessos"
DOCS="https://headlessos.com/docs/installation"

say() { printf '%s\n' "$*"; }
fail() {
    printf 'HeadlessOS was not installed: %s\n' "$*" >&2
    exit 1
}
refuse_if_running() {
    if pgrep -xq HeadlessOS; then
        fail "HeadlessOS is running. Quit it (HeadlessOS menu, then Quit), then run this again."
    fi
}

# M17.11: the copy that's already here, if any, and its version
existing_app() {
    for found in /Applications/HeadlessOS.app "$HOME/Applications/HeadlessOS.app"; do
        if [ -d "$found" ]; then
            printf '%s\n' "$found"
            return 0
        fi
    done
    return 1
}
installed_version() {
    found=$(existing_app) || return 0
    /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$found/Contents/Info.plist" 2>/dev/null || true
}

# All in one function, called on the last line: a script cut short on its way here runs nothing.
main() {
    [ "$(uname -s)" = Darwin ] || fail "this script is for macOS. For Windows and Linux, see $DOCS"

    # The latest release, from where GitHub sends /releases/latest: no API call, so no rate limit.
    latest=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$REPO/releases/latest") ||
        fail "GitHub could not be reached."
    tag=${latest##*/}
    case "$tag" in
        v[0-9]*) ;;
        *) fail "the latest release could not be found." ;;
    esac
    asset="HeadlessOS-${tag#v}-universal-mac.zip"

    # M17.11: macOS asks for the Keychain password after a reinstall, even of the same build, so the
    # same version isn't installed twice. HEADLESSOS_REINSTALL=1 does it anyway, for a broken copy.
    current=$(installed_version)
    if [ "$current" = "${tag#v}" ] && [ "${HEADLESSOS_REINSTALL:-}" != 1 ]; then
        say "HeadlessOS $current is already installed, and it's the latest release. Nothing to do."
        say "To install it again anyway: curl -fsSL https://raw.githubusercontent.com/abhee235/headlessos/main/install.sh | HEADLESSOS_REINSTALL=1 sh"
        return 0
    fi
    refuse_if_running

    work=$(mktemp -d)
    trap 'rm -rf "$work"' EXIT
    trap 'exit 1' INT TERM

    curl -fsSL -o "$work/SHA256SUMS" "$REPO/releases/download/$tag/SHA256SUMS" 2>/dev/null ||
        fail "release $tag has no SHA256SUMS, so its files can't be checked. Download it from $DOCS instead."
    say "Downloading $asset, from release $tag..."
    curl -fsSL -o "$work/$asset" "$REPO/releases/download/$tag/$asset" ||
        fail "$asset could not be downloaded."

    # A name may carry sha256sum's binary-mode mark, "*".
    expected=$(awk -v file="$asset" '{ name = $2; sub(/^\*/, "", name) } name == file { print $1 }' "$work/SHA256SUMS")
    [ -n "$expected" ] || fail "the release's SHA256SUMS has no line for $asset."
    actual=$(shasum -a 256 "$work/$asset" | awk '{ print $1 }')
    [ "$expected" = "$actual" ] || fail "$asset does not match its SHA-256 in the release, so it was deleted."
    say "Checked: its SHA-256 is the release's."

    # With GitHub's CLI signed in, also that the release workflow built this very file.
    if command -v gh >/dev/null 2>&1 && gh auth status >/dev/null 2>&1; then
        gh attestation verify "$work/$asset" --repo abhee235/headlessos >/dev/null ||
            fail "GitHub could not confirm that the release workflow built $asset."
        say "Checked: GitHub confirms the release workflow built it."
    fi

    # ditto, not unzip: it keeps the links inside the app's frameworks.
    ditto -x -k "$work/$asset" "$work/unpacked" || fail "$asset could not be unpacked."
    new="$work/unpacked/HeadlessOS.app"
    [ -x "$new/Contents/MacOS/HeadlessOS" ] || fail "$asset has no HeadlessOS.app in it."
    codesign --verify --deep --strict "$new" 2>/dev/null ||
        fail "the app's signature doesn't match its files, so it was not installed."

    # Where a copy already is, so an update replaces it; otherwise Applications, or your own
    # Applications folder when that one isn't writable for this account.
    if [ -d /Applications/HeadlessOS.app ]; then
        app=/Applications/HeadlessOS.app
    elif [ -d "$HOME/Applications/HeadlessOS.app" ]; then
        app="$HOME/Applications/HeadlessOS.app"
    elif [ -w /Applications ]; then
        app=/Applications/HeadlessOS.app
    else
        app="$HOME/Applications/HeadlessOS.app"
    fi
    folder=$(dirname "$app")
    mkdir -p "$folder"
    [ -w "$folder" ] || fail "$folder isn't writable for this account, so $app can't be replaced."

    refuse_if_running
    rm -rf "$app" || fail "the copy in $folder could not be removed."
    mv "$new" "$app" || fail "HeadlessOS could not be put in $folder."
    say "Installed: $app"

    say "When you connect to a device on your local network, macOS asks to let HeadlessOS find devices"
    say "on it. Click Allow."
    open "$app"
}

main "$@"
