#!/usr/bin/env bash
#
# Publish a stable release of sitevision-cli to the npm "latest" dist-tag.
#
# This is what everyone gets from `npm i -g sitevision-cli`, so it prompts for
# confirmation before publishing. For pre-release builds use publish-beta.sh.
#
# Usage:
#   ./scripts/publish.sh            # bump patch:  0.3.0 -> 0.3.1
#   ./scripts/publish.sh minor      # bump minor:  0.3.0 -> 0.4.0
#   ./scripts/publish.sh major      # bump major:  0.3.0 -> 1.0.0
#
# Running this on a current beta (e.g. 0.4.0-beta.1) with the default `patch`
# graduates it to the stable 0.4.0.
#
# The argument is any npm "version" keyword (default: patch).

set -euo pipefail

# Always run from the repo root, regardless of where the script is invoked.
cd "$(dirname "$0")/.."

BUMP="${1:-patch}"

# npm version requires a clean tree to create its commit/tag; fail early with a
# clearer message so a half-finished change never gets published.
if [[ -n "$(git status --porcelain)" ]]; then
	echo "✗ Working tree is not clean — commit or stash your changes first." >&2
	exit 1
fi

CURRENT_VERSION="$(node -p "require('./package.json').version")"
echo "Current version: ${CURRENT_VERSION}  (bump: ${BUMP})"
read -r -p "Publish a new stable release to 'latest'? [y/N] " reply
if [[ ! "$reply" =~ ^[Yy]$ ]]; then
	echo "Aborted."
	exit 0
fi

echo "→ Bumping version (${BUMP})…"
NEW_VERSION="$(npm version "$BUMP" -m "release %s")"

echo "→ Building…"
npm run build

echo "→ Publishing ${NEW_VERSION} to 'latest'…"
npm publish

cat <<EOF

✓ Published ${NEW_VERSION}
  Install with:  npm i -g sitevision-cli
  Push the tag:  git push --follow-tags
EOF
