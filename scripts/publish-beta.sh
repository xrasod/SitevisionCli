#!/usr/bin/env bash
#
# Publish a beta release of sitevision-cli under the npm "beta" dist-tag.
#
# Stable users (`npm i -g sitevision-cli`) are unaffected — they keep getting
# `latest`. Testers opt in explicitly with:
#
#     npm i -g sitevision-cli@beta
#
# Usage:
#   ./scripts/publish-beta.sh             # bump the beta:  0.4.0-beta.0 -> 0.4.0-beta.1
#   ./scripts/publish-beta.sh preminor    # start a new beta line: 0.3.0 -> 0.4.0-beta.0
#   ./scripts/publish-beta.sh prepatch    # start a beta of a patch: 0.3.0 -> 0.3.1-beta.0
#   ./scripts/publish-beta.sh premajor    # start a beta of a major: 0.3.0 -> 1.0.0-beta.0
#
# The argument is any npm "version" prerelease keyword (default: prerelease).

set -euo pipefail

# Always run from the repo root, regardless of where the script is invoked.
cd "$(dirname "$0")/.."

BUMP="${1:-prerelease}"

# npm version requires a clean tree to create its commit/tag; fail early with a
# clearer message so a half-finished change never gets published.
if [[ -n "$(git status --porcelain)" ]]; then
	echo "✗ Working tree is not clean — commit or stash your changes first." >&2
	exit 1
fi

echo "→ Bumping version (${BUMP}, beta)…"
NEW_VERSION="$(npm version "$BUMP" --preid=beta -m "beta release %s")"

echo "→ Building…"
npm run build

echo "→ Publishing ${NEW_VERSION} under the 'beta' tag…"
npm publish --tag beta

cat <<EOF

✓ Published ${NEW_VERSION}
  Install with:  npm i -g sitevision-cli@beta
  Push the tag:  git push --follow-tags
EOF
