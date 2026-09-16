# Changelog

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
