# Changelog

## 1.0.2

- Workspace settings can switch environment again. Press `v` in the settings
  pane to cycle the workspace's environments; the pane now cycles the ones
  defined in the workspace's root file, so an environment that only exists
  in one app can no longer become a root override.
- Adding an environment in a workspace checks the name against the file
  being written, not the current app, so a name that clashes with the
  workspace's base environment is rejected there too.

## 1.0.1

- The "what's new" panel shown after an update now lists the earlier releases
  below the new ones, dimmed, instead of stopping at the version you had.

## 1.0.0

First stable release. Everything from the betas is in, see the entries below.

- `svc --debug` (or `SVC_DEBUG=1`) writes a log of everything svc does during
  the run: each action, task and its output, request to Sitevision, child
  process, config change, prompt and keychain lookup. The path is printed on
  exit. Passwords, tokens and cookies are never written; the site, username
  and file paths are, so read it before attaching it to a bug report.
- Bug reports and feature requests have forms on GitHub.

## 1.0.0-beta.33

- **Breaking:** `--token` and `--cookie` are removed, since credentials on the
  command line end up in shell history. Use `SITEVISION_ACCESS_TOKEN` or
  `SITEVISION_SESSION_COOKIE` instead.
- **Breaking:** an unknown flag is now an error (exit code 2), so a misspelt
  `--production` never turns into a dev deploy.
- `svc build`, `svc sign` and `svc deploy` work without a terminal. They print
  their log line by line and exit on their own with a proper exit code: 0 on
  success, 1 on failure, 130 when a prompt is cancelled. `svc dev` and
  `svc watch` no longer crash when stdin is a pipe.
- New flags: `--no-zip` for `build`, and the short forms `-s`, `-f`, `-p` and
  `-a`.
- Global settings in `~/.config/sitevision-cli/config.json`: a default signing
  user and certificate for every project that does not set its own, and
  switches for the update check and the addon name warning. Edit them with `,`
  in the shell, which now shows a description of each setting and opens from
  anywhere, or run `svc setup-signing --global`. A file that does not parse is
  reported and left alone.
- The Config tab marks the addon name with `≠ manifest` when it matches none
  of the manifest's names. Nothing is changed for you; the two are different
  things and `svc` only points the difference out.
- The manifest's name and description always have a Swedish row in the Config
  tab. Filling it in on a plain name keeps the old text as the English one.
- In a workspace, an environment's addon name is stored per app. Setting it
  for one app no longer leaks into the others.
- `svc` names the missing setting when the deploy config is incomplete,
  instead of posting to "undefined".
- A production deploy with `--activate` fails if the activation did not
  happen, and the confirmation names the addon it deploys to.
- OAuth2 requires https and a token endpoint on the site's own domain. A
  refresh token is only thrown away when the site rejects it, not on a network
  error. An expired session cookie is removed so the next deploy asks for a
  new login.
- A plaintext password in `.dev_properties.json` is moved to the keychain when
  the file is saved, and `svc` says so when the keychain cannot store a secret.
  `SVC_NO_KEYCHAIN=1` turns the keychain off for CI.
- `svc dev` with a project's own webpack config no longer deploys a half-built
  zip when several files change at once.
- Builds work when dependencies are hoisted to the workspace root, a
  `manifest.json` in the project root is picked up, file names with å, ä and ö
  survive in the zip, and `SITEVISION_APP_ID_PREFIX`/`_SUFFIX` apply to build,
  sign and deploy alike.
- A broken app in a workspace is skipped with a message instead of stopping
  the shell. The shell asks before quitting during app creation, the PROD
  badge survives a narrow terminal, Esc cancels a confirm, and Ctrl-modified
  keys never fire a shortcut.
- The update check is skipped without a terminal and when `CI` is set.
- Updated user guides in English and Swedish.

## 1.0.0-beta.32

- Sitevision CLI can now create new apps. **New app** in the command palette
  runs Sitevision's own `create-sitevision-app` as a managed experience and
  guides you through the setup: pick a name and a folder, then answer the
  tool's questions right in `svc`. What your workspace already knows (domain,
  site name, username) is filled in for you, and passwords never end up in a
  file.
- When the app is created, `svc` fills in its manifest (the name, plus author
  and help URL from the workspace's `package.json`) and offers to create the
  addon on the site, so the app is ready for its first deploy.
- If the tool cannot be run this way, `svc` hands it the terminal and picks up
  again when it is done.
- The Config tab has a MANIFEST section for editing `manifest.json`: id,
  version, name, description, author and help URL, one row per language for
  localized fields. Comments and formatting in the file are kept.
- `y` (sync `package.json`) now also mirrors the manifest's `version`,
  `description` and `author` into the app's `package.json`. An app whose
  `package.json` lacks them shows as out of sync until `y` is pressed.

## 1.0.0-beta.31

- The help panel (`?`) now starts with a short guide to the pane you are in:
  what it shows, how the values relate, and which keys apply. The Config guide
  explains how local, shared and workspace settings layer on top of each
  other. The panel scrolls when it does not fit.
- Updated dependencies.

## 1.0.0-beta.30

- Dev and watch no longer rebuild on file events that change nothing, such as
  editor metadata, swap files or `.DS_Store`. Ignored events are logged as
  warnings so a stray trigger can be traced.
- The log names the event and path of the file that started a rebuild, for
  example `change src/index.tsx`.

## 1.0.0-beta.29

- After an update, the shell opens What's new with the changes since the
  version you last ran.

## 1.0.0-beta.28

## 1.0.0-beta.27

- Popups float over the screen instead of replacing the content pane: the
  command palette, settings, addon picker, confirmations and prompts.
- `?` opens a help panel with every key, plus the keys for the current tab.
- What's new in the command palette shows this changelog.

## 1.0.0-beta.26

- No functional changes.

## 1.0.0-beta.25

- Deploying to an addon that does not exist yet now offers to create it and
  deploy again. If the addon list cannot be read, the error suggests logging in
  again instead, since an expired session fails the same way.
- A Create addon action appears in the command palette when a deploy has found
  the addon missing.
- Creating a RESTApp or MCPServer addon no longer sends a category, which only
  WebApp and widget addons use.

## 1.0.0-beta.24

- Deploying to a non-production environment uploads the signed zip when it is at
  least as new as the build. The log names the zip that was uploaded.
- `x` in the Log tab wraps long lines immediately, and wrapped lines no longer
  push the newest line out of view.
- Keys: switching environment moved from `E` to `v`, and refreshing versions
  from `R` to `r`. Tab in the Config form moves between fields without leaving
  the form.
- The bottom bar now shows force deploy (`P`), stop, config, login and settings.
- Running commands are stopped when `svc` exits.
