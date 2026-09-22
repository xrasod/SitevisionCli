# Contributing

Thanks for helping out. This is a small project, so the process is light, but
a few things make reviewing much easier.

## Before you start

- **Bugs and features start as an issue.** Use the issue forms; they ask for
  the details we need. For anything beyond a small fix, open the issue first so
  we can agree on the approach before you write code.
- **Security problems are not issues.** See [SECURITY.md](SECURITY.md).
- **Questions about the Sitevision platform itself** belong at
  [developer.sitevision.se](https://developer.sitevision.se), not here.

## Setting up

You need Node 22 or newer and npm.

```bash
git clone https://github.com/xrasod/SitevisionCli.git
cd SitevisionCli
npm install
npm run build   # tsc → dist/
npm test        # prettier, xo, ava
```

To run your local build as `svc`, link it once with `npm link`, then keep
`npm run dev` running: every save recompiles `dist/`, so `svc` in any
Sitevision app reflects your changes. `npm unlink -g sitevision-cli` and
`npm install -g sitevision-cli` restore the published version.

## Tests

`npm test` runs Prettier, xo and the ava suite, and CI runs the same on Linux
and Windows. The suite is sandboxed: it never touches your real OS keychain or
config directory (see the `ava` block in `package.json`). If you run a single
test file some other way, set `SVC_NO_KEYCHAIN=memory` first so it stays that
way.

Changes to logic should come with a test. Shell (UI) code is tested with
`ink-testing-library`, see `test/shell.test.tsx` for the pattern. Anything that
talks to a real Sitevision site (deploy, auth, signing) should also be tried
against a real site before you open the PR, and the PR should say which auth
method and Sitevision version you used.

## Code style

Formatting and linting are enforced by Prettier and xo, so run `npm test`
before pushing and let the tools decide. Beyond that:

- Keep changes focused. One fix or feature per PR, no unrelated refactors or
  reformatting.
- Prefer small, self-explanatory code over comments. Comment only where the
  intent is genuinely non-obvious.
- Platform-specific code (paths, processes, the keychain, terminal handling)
  needs to work on Windows as well as macOS and Linux. Ship both branches in
  the same change; do not leave a TODO for the other platform.
- Server-side Sitevision apps run on Rhino, but this CLI does not, so modern
  Node is fine here.

## Pull requests

- Branch from `main` and keep the branch rebased on it.
- Fill in the PR template. It is short on purpose; the important part is how
  you tested the change.
- **Do not add a changelog entry.** `CHANGELOG.md` is written by the maintainer
  at release time from the merged changes.
- Update the readme or `docs/` if you changed a command, flag, config key or
  workflow.
- Never commit secrets, site URLs, usernames or captured sessions, including in
  tests and fixtures.
- CI must be green before review.

## Releases

Releases are cut by the maintainer, see [RELEASING.md](RELEASING.md).
Contributors do not need to do anything for a release.

## Code of conduct

Everyone interacting in this project is expected to follow the
[Code of Conduct](CODE_OF_CONDUCT.md).
