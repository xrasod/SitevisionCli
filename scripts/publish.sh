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
#
# Retry-safe: the version is bumped in package.json/package-lock.json *without*
# a git commit or tag, and is reverted automatically if the build or publish
# fails. The commit + tag are created only after a successful publish — so a
# failed run leaves the tree untouched and you can simply re-run it.

set -euo pipefail

# Always run from the repo root, regardless of where the script is invoked.
cd "$(dirname "$0")/.."

BUMP="${1:-patch}"

# A pre-release must never land on "latest".
if [[ "$BUMP" == pre* ]]; then
	echo "✗ '${BUMP}' is a pre-release bump — use publish-beta.sh." >&2
	exit 1
fi

# Stable releases come from main, so the default branch is what was published.
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$BRANCH" != "main" ]]; then
	echo "✗ On '${BRANCH}' — stable releases are published from main." >&2
	exit 1
fi

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

CURRENT_VERSION="$(node -p "require('./package.json').version")"
echo "Current version: ${CURRENT_VERSION}  (bump: ${BUMP})"
read -r -p "Publish a new stable release to 'latest'? [y/N] " reply
if [[ ! "$reply" =~ ^[Yy]$ ]]; then
	echo "Aborted."
	exit 0
fi

# Bump the version in package.json + package-lock.json only — no git commit/tag
# yet (those happen after a successful publish).
echo "→ Bumping version (${BUMP})…"
NEW_VERSION="$(npm version "$BUMP" --no-git-tag-version)"

# If anything below fails, undo the bump so a retry starts from the same version.
rollback() {
	echo "✗ Failed — reverting version bump (${NEW_VERSION})." >&2
	git checkout -- package.json package-lock.json
}
trap rollback ERR
trap 'rollback; exit 130' INT TERM

# The changelog ships in the package and drives the in-app "what's new".
if ! grep -qx "## ${NEW_VERSION#v}" CHANGELOG.md; then
	echo "✗ CHANGELOG.md has no '## ${NEW_VERSION#v}' heading — add and commit the entry first." >&2
	false
fi

echo "→ Building ${NEW_VERSION}…"
npm run build

echo "→ Publishing ${NEW_VERSION} to 'latest'…"
npm publish

# Published successfully — make the bump permanent in git.
trap - ERR INT TERM
# If this fails the package is already out: commit the bump by hand, don't re-run.
git commit -m "release ${NEW_VERSION}" -- package.json package-lock.json
git tag "${NEW_VERSION}"

cat <<EOF

✓ Published ${NEW_VERSION}
  Install with:           npm i -g sitevision-cli
  Push the commit + tag:  git push --follow-tags
EOF
