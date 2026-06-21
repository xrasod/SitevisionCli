# Releasing

This project publishes to npm as [`sitevision-cli`](https://www.npmjs.com/package/sitevision-cli) (installed CLI: `svc`).

Two helper scripts handle versioning, building, tagging, and publishing. You
only pick the **bump type** — `npm version` does the math and writes the new
version into `package.json` _and_ `package-lock.json`, then creates a git
commit and tag.

| Command                | npm dist-tag | Who gets it                                  | Default bump |
| ---------------------- | ------------ | -------------------------------------------- | ------------ |
| `npm run release`      | `latest`     | everyone (`npm i -g sitevision-cli`)         | `patch`      |
| `npm run release:beta` | `beta`       | opt-in only (`npm i -g sitevision-cli@beta`) | `prerelease` |

> Pass a bump type after `--`, e.g. `npm run release -- minor`. The `--` is
> required so npm forwards the argument to the script. The raw scripts also
> work without it: `./scripts/publish.sh minor`.

## Before you release

- Be **logged in to npm** with publish rights (`npm whoami`).
- Have a **clean working tree** — both scripts refuse to run otherwise (this is
  also what `npm version` needs to create its commit/tag). Commit or stash
  first.
- After publishing, push the version commit and tag: `git push --follow-tags`.

## Stable releases

`npm run release` prompts for confirmation (it goes to every user), then bumps,
builds, and publishes to `latest`.

```bash
npm run release            # patch:  0.3.0 → 0.3.1
npm run release -- minor   # minor:  0.3.0 → 0.4.0
npm run release -- major   # major:  0.3.0 → 1.0.0
```

## Beta releases

Betas live under the `beta` dist-tag, so stable users are unaffected — only
people who explicitly install `@beta` get them.

```bash
npm run release:beta               # next beta:  0.4.0-beta.0 → 0.4.0-beta.1
npm run release:beta -- preminor   # start a beta line:  0.3.0 → 0.4.0-beta.0
npm run release:beta -- prepatch   # beta of a patch:    0.3.0 → 0.3.1-beta.0
npm run release:beta -- premajor   # beta of a major:    0.3.0 → 1.0.0-beta.0
```

Testers install with:

```bash
npm i -g sitevision-cli@beta            # newest beta
npm i -g sitevision-cli@0.4.0-beta.1    # a specific beta
```

### Graduating a beta to stable

Running the stable script with the default `patch` drops the `-beta` suffix and
publishes the target version to `latest`:

```bash
npm run release            # 0.4.0-beta.2 → 0.4.0
```

> ⚠️ The graduated number depends on which `pre*` keyword started the beta line.
> Start a beta with `premajor` to land on `1.0.0`, `preminor` to land on a new
> minor, `prepatch` for a patch. If you start with `preminor` (`0.4.0-beta.x`),
> graduating gives `0.4.0` — **not** `1.0.0`. Pick the level up front to match
> where you intend to land. To go straight to a stable major with no beta
> phase, just use `npm run release -- major`.

## Managing dist-tags manually

```bash
npm dist-tag ls sitevision-cli                       # list tags
npm dist-tag add sitevision-cli@0.4.0-beta.1 latest  # promote a specific beta to latest
npm dist-tag rm sitevision-cli beta                  # remove the beta tag
```

## Update notifications

On startup `svc` checks the npm registry's `latest` tag and prints a notice if a
newer stable version exists (see `source/utils/version-check.ts`). Because the
check looks only at `latest`, **beta publishes never nag stable users** — and a
user on a beta build won't be told to "update" to an older stable.
