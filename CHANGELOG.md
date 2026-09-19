# Changelog

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
