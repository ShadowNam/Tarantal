#!/bin/bash
# Installs npm dependencies at the start of Claude Code CLOUD sessions only.
# Runs from the SessionStart hook in .claude/settings.json. Locally it exits immediately.
# Skips work when package.json, package-lock.json and this script are unchanged since the last
# successful install. Never fails the session: problems are printed for Claude to see.

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 0

# Before milestone M0 creates package.json there is nothing to install.
if [ ! -f package.json ]; then
  echo "install_pkgs: no package.json yet (pre-M0) - skipping install"
  exit 0
fi

hashes=node_modules/.install_pkgs.sha256
files="scripts/install_pkgs.sh package.json"
[ -f package-lock.json ] && files="$files package-lock.json"

if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  rm -f "$hashes"
  if [ -f package-lock.json ]; then
    install_cmd="npm ci"
  else
    install_cmd="npm install"
  fi
  if $install_cmd; then
    mkdir -p node_modules
    sha256sum $files > "$hashes" || rm -f "$hashes"
  else
    echo "install_pkgs: '$install_cmd' failed - ask Claude to run it and report the error"
  fi
fi

# Playwright browsers (best effort). Their download hosts may not be on the cloud environment's
# Trusted allowlist; if this fails, see README "Cloud sessions" for the fix.
if [ -d node_modules/@playwright/test ] && [ ! -f node_modules/.playwright_browsers_ok ]; then
  if npx --no-install playwright install chromium webkit >/dev/null 2>&1; then
    touch node_modules/.playwright_browsers_ok
  else
    echo "install_pkgs: Playwright browser download failed (network allowlist?) - e2e tests need it"
  fi
fi

exit 0
