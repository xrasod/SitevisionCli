# Project instructions

## Changelog

`CHANGELOG.md` is written by hand.

- Every `##` heading is a published version (`## 1.0.0-beta.25`), newest first.
  Use `##` for nothing else.
- Entries describe user-facing changes in short, plain bullets. No commit
  hashes, no internal refactors unless they change behavior.
- Leave entries for published versions alone, apart from typos.

## Releases

Releases are published with `scripts/publish-beta.sh` or `scripts/publish.sh`
(see `RELEASING.md`). The script computes the new version, and it refuses to run
on a dirty tree, so the changelog entry has to be committed before publishing.

Don't add changelog entries during development. When the user says they are
ready for a release:

1. Look at what changed since the last release tag (`git log <tag>..HEAD`).
2. Suggest the bump and why: patch for fixes, minor for new features, major for
   breaking changes (removed or renamed commands, flags or keys, incompatible
   config). Name the script and argument, e.g. `./scripts/publish-beta.sh`
   (next beta) or `./scripts/publish-beta.sh preminor`, and the version it will
   produce.
3. Suggest the changelog entry under that version heading.
4. Wait for the user's approval before writing it to `CHANGELOG.md`.
