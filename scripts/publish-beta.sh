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
#
# Retry-safe: the version is bumped in package.json/package-lock.json *without*
# a git commit or tag, and is reverted automatically if the build or publish
# fails. The commit + tag are created only after a successful publish — so a
# failed run leaves the tree untouched and you can simply re-run it.

set -euo pipefail

# Always run from the repo root, regardless of where the script is invoked.
cd "$(dirname "$0")/.."

BUMP="${1:-prerelease}"

# Fail early on a dirty tree so the automatic revert (git checkout) below can't
# clobber unrelated edits.
if [[ -n "$(git status --porcelain)" ]]; then
	echo "✗ Working tree is not clean — commit or stash your changes first." >&2
	exit 1
fi

# Fail fast on the common "not logged in" case before touching any files.
if ! npm whoami >/dev/null 2>&1; then
	echo "✗ Not logged in to npm — run 'npm login' first." >&2
	exit 1
fi

# Bump the version in package.json + package-lock.json only — no git commit/tag
# yet (those happen after a successful publish).
echo "→ Bumping version (${BUMP}, beta)…"
NEW_VERSION="$(npm version "$BUMP" --preid=beta --no-git-tag-version)"

# If anything below fails, undo the bump so a retry starts from the same version.
rollback() {
	echo "✗ Failed — reverting version bump (${NEW_VERSION})." >&2
	git checkout -- package.json package-lock.json
}
trap rollback ERR

echo "→ Building ${NEW_VERSION}…"
npm run build

echo "→ Publishing ${NEW_VERSION} under the 'beta' tag…"
npm publish --tag beta

# Published successfully — make the bump permanent in git.
trap - ERR
git commit -m "beta release ${NEW_VERSION}" -- package.json package-lock.json
git tag "${NEW_VERSION}"

cat <<EOF

✓ Published ${NEW_VERSION}
  Install with:           npm i -g sitevision-cli@beta
  Push the commit + tag:  git push --follow-tags
EOF
