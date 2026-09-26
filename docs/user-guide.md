# Sitevision CLI – User guide

> Svenska: [anvandarguide.md](anvandarguide.md)

> **Unofficial.** `svc` is an independent, community-made tool. It is not
> developed, endorsed or supported by Sitevision AB. Report problems in the
> tool's GitHub repository, not to Sitevision support. Built lovingly as an
> extension of the official
> [`@sitevision/sitevision-scripts`](https://github.com/sitevision/sitevision-apps).

This guide explains how `svc` works day to day: how it finds your apps, where
configuration lives, how the interactive shell is driven, and in detail how
authentication works.

- [1. Concepts](#1-concepts)
- [2. Installing and starting](#2-installing-and-starting)
- [3. The shell](#3-the-shell)
- [4. Configuration](#4-configuration)
- [5. Authentication](#5-authentication)
- [6. Environments and production](#6-environments-and-production)
- [7. Build, sign, deploy](#7-build-sign-deploy)
- [8. Direct commands and CI](#8-direct-commands-and-ci)
- [9. Troubleshooting](#9-troubleshooting)
- [Reference](#reference)

---

## 1. Concepts

| Term                        | Meaning                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **App**                     | A directory with a `manifest.json` (in the root, `static/` or `src/`) and a `package.json`. WebApp, Widget, RESTApp and MCPServer are supported.       |
| **Workspace**               | A repository that contains several apps in subfolders, e.g. `webapps/*`, `restapps/*`, `widgets/*`.                                                    |
| **`.dev_properties.json`**  | Your local configuration and the main source: domain, site, addon, username, auth method, signing user, environments. Keep it out of version control.  |
| **`package.json` defaults** | Shared, committed values that sit underneath `.dev_properties.json`: everything except user-specific fields.                                           |
| **Keychain**                | The operating system's secret store (macOS Keychain, Windows Credential Manager, libsecret on Linux). All passwords, tokens and cookies are kept here. |
| **Environment**             | A named target site, e.g. `dev`, `test`, `prod`. The top-level config is one environment; others override only what differs.                           |
| **Addon**                   | The custom module in the site's Addon Repository that the app is uploaded into.                                                                        |

## 2. Installing and starting

Requires Node.js 22 or later.

```bash
npm install --global sitevision-cli
```

Run `svc` with no arguments:

- **Inside an app** → the shell opens in single-app mode.
- **At the root of a repository** → the shell searches subfolders (up to three
  levels, skipping `node_modules`, `dist`, `build` and dot-folders) and opens in
  workspace mode with every app in a navigator on the left.
- Anywhere else → an error saying no apps were found.

The first time `svc` runs inside an app a short welcome screen is shown. After
an upgrade a one-line "updated to vX" banner is shown, and when a newer version
exists on npm `svc` tells you.

If a workspace has apps but no usable config (no domain/site anywhere), the
shell opens directly on **Workspace settings** so the shared config can be
filled in once. `Esc` skips it.

## 3. The shell

```
┌ top bar: context · domain · auth state · environment badge · version ┐
│ navigator  │  Overview · Config · Versions · Log                     │
│ (workspace)│                                                          │
└ bottom bar: the keys that apply right now · running task / message   ┘
```

The **top bar** shows which app and tab you are on, the site domain, the auth
state (for example `basic me@acme.se`, `oauth2 · not logged in`,
`sso · not logged in`) and a badge for the active environment: green for the
base environment, yellow for others, red for production.

The **bottom bar** always lists the keys that work in the current context, so
you rarely need this table. When a task runs its progress is shown on the
right.

### Focus: navigator and content

In workspace mode there are two panes. `Tab` switches between them.

- In the **navigator**, typing filters the app list (fuzzy match). `↑`/`↓`
  moves, `Enter` selects the app **and moves focus to the content pane**,
  `Esc` clears the filter.
- Action keys such as `d` or `p` only work in the **content pane**. Typing `d`
  in the navigator searches for "d" instead.
- The last row in the navigator is **Workspace settings**: the root
  `.dev_properties.json`, with the root `package.json` defaults underneath. See
  [4](#shared-config-in-a-workspace).

### Tabs

| Tab          | Content                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Overview** | App info and status: dependencies installed, config complete, `package.json` in sync, signing configured, and recent tasks. |
| **Config**   | All of `.dev_properties.json` as one form, plus the secrets in the keychain. See [4](#4-configuration).                     |
| **Versions** | The versions uploaded to the addon on the active environment's site. `a` activates the selected version, `r` refreshes.     |
| **Log**      | Streaming output from build, sign, deploy, dev and watch for the selected app.                                              |

`1`–`4` or `←`/`→` switch tabs.

### Keys

Global (content pane):

| Key       | Action                                                             |
| --------- | ------------------------------------------------------------------ |
| `d`       | Dev: build on every change, sign if configured, deploy             |
| `w`       | Watch: build on every change, sign if configured, never deploy     |
| `b`       | Build once                                                         |
| `s`       | Sign the built zip                                                 |
| `p` / `P` | Deploy / force deploy to the active environment                    |
| `a`       | Open Versions (and activate, when already there)                   |
| `v`       | Cycle the active environment                                       |
| `K`       | Stop running tasks for the selected app                            |
| `e`       | Open the Config tab                                                |
| `y`       | Copy shared values from `.dev_properties.json` into `package.json` |
| `i`       | `npm install`                                                      |
| `l`       | Log in again (discards the credential held for this session)       |
| `,`       | Settings: language, update check, hints, default signing user      |
| `/`       | Command palette: every action, searchable                          |
| `?`       | Help: every key, plus the ones that work where you are             |
| `Tab`     | Switch between navigator and content                               |
| `Esc`     | Back / cancel                                                      |
| `q`       | Quit (stops running tasks)                                         |

Per tab:

| Tab      | Keys                                                                                                             |
| -------- | ---------------------------------------------------------------------------------------------------------------- |
| Config   | `↑`/`↓` or `Tab` field · `Enter` edit / save · `Esc` cancel · `←`/`→`/space cycles choices · `Ctrl+O` pick addon |
| Versions | `↑`/`↓` select · `a` activate · `r` refresh                                                                      |
| Log      | `↑`/`↓` scroll · `PgUp`/`PgDn` page · `f` jump to the end · `x` toggle line wrap                                 |

Only available from the command palette (`/`): **Add environment**,
**Workspace settings**, **Log out**, and **Migrate password to OS keychain**
(shown when an old plaintext password is found).

Dev and watch keep running in the background while you move between apps.
Several apps can run at the same time.

### Creating a new app

**New app** in the command palette (`/`) scaffolds an app with Sitevision's own
tool, `npx @sitevision/create-sitevision-app <name>`. `svc` asks for the name
and the folder to create it in, runs the tool as a task (its output is in the
**Log** tab), and shows the tool's questions as they come. Whatever the tool
asks is what you are asked; two things differ from running it by hand:

- Domain, site name, username and the HTTP setting are answered from the
  workspace config when it has them.
- The password question is skipped. Passwords belong in the keychain, not in
  the app's `.dev_properties.json`.

When the tool is done, `svc` replaces the template's placeholders in
`manifest.json`: the name becomes the app name, and `author` and `helpUrl` come
from `author` and `homepage` in the workspace root's `package.json` when they
are set. In a workspace the app's `.dev_properties.json` is reduced to what
differs from the shared config (usually nothing, so it is removed) and the addon
name moves to the app's `package.json`. The new app is selected and `svc`
offers to create its addon on the site.

If the tool cannot be driven this way (a future version may ask its questions
differently, and Node older than 22.15 cannot hook into it), `svc` steps aside
and runs the same command on the normal terminal, then comes back and fills in
the manifest the same way.

### Compact layout

`svc --minimal`, or any terminal narrower than 100 columns, uses a compact
layout: no sidebar (the app list becomes a one-line strip) and short tab
names. Useful in a split pane.

## 4. Configuration

Configuration lives in two files:

| File                   | Holds                                                                                   | Commit? |
| ---------------------- | --------------------------------------------------------------------------------------- | ------- |
| `.dev_properties.json` | Your config. The main source; plain sitevision-scripts reads it too.                    | No      |
| `package.json`         | Shared defaults for everyone working on the app: every value except user-specific ones. | Yes     |

`username`, `signingUsername` and `certificateName` are **user-specific**. They
only ever live in `.dev_properties.json`. Add `.dev_properties.json` to
`.gitignore`: `svc` never writes secrets into it, but plain sitevision-scripts
stores the deploy password there.

### `.dev_properties.json`

```json
{
	"domain": "acme-use.sitevision-cloud.se",
	"siteName": "Intranet",
	"addonName": "my-addon",
	"username": "me@acme.se",
	"authMethod": "basic",
	"signingUsername": "me@acme.se",
	"certificateName": "",
	"useHTTPForDevDeploy": false
}
```

| Field                 | Meaning                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `domain`              | Host of the site, without `https://`. A pasted URL is reduced to the host when saved.                                  |
| `siteName`            | The site's root node name as shown in the site tree. Part of the REST API path.                                        |
| `addonName`           | The addon in the Addon Repository. `Ctrl+O` on this field lists the existing addons.                                   |
| `username`            | Sitevision account for deploys. Needs DEVELOPER or MANAGE_ADDONS on the site. Required for `basic`; a label otherwise. |
| `authMethod`          | `basic` (default), `oauth2` or `cookie`. See [5](#5-authentication).                                                   |
| `oauth2`              | `{clientId, authorizationEndpoint, tokenEndpoint, scopes, redirectPort}` for `oauth2`.                                 |
| `sessionLoginUrl`     | Page opened for `cookie` login. Defaults to the site root.                                                             |
| `useHTTPForDevDeploy` | Plain HTTP instead of HTTPS. Only for local servers without TLS.                                                       |
| `signingUsername`     | Your developer.sitevision.se account.                                                                                  |
| `certificateName`     | Which certificate to sign with, if the account has several.                                                            |
| `baseEnvironment`     | Name of the top-level environment. Defaults to `dev`.                                                                  |
| `production`          | Makes the base environment a production environment.                                                                   |
| `environments`        | Other environments. See [6](#6-environments-and-production).                                                           |

The file may also be named `.dev-properties.json`.

### Defaults in `package.json`

Shared values are committed in `package.json`. `svc` reads them underneath
`.dev_properties.json`, so a value in `.dev_properties.json` always wins.

```json
{
	"developmentDomain": "acme-use.sitevision-cloud.se",
	"siteName": "Intranet",
	"addonName": "my-addon",
	"svc": {
		"authMethod": "oauth2",
		"oauth2": {
			"clientId": "svc-cli",
			"authorizationEndpoint": "https://acme-use.sitevision-cloud.se/oauth2-provider/authorize",
			"tokenEndpoint": "https://acme-use.sitevision-cloud.se/oauth2-provider/token"
		},
		"environments": {"prod": {"domain": "acme.sitevision-cloud.se"}}
	}
}
```

`developmentDomain` (the domain), `siteName` and `addonName` sit at the top
level. The other shared fields (`authMethod`, `oauth2`, `sessionLoginUrl`,
`useHTTPForDevDeploy`, `baseEnvironment`, `production`, `environments`) go under
`"svc"`. User-specific fields are ignored there.

A new developer opens the app with `svc` and enters their username. In
single-app mode the first save writes a complete `.dev_properties.json` with
the defaults filled in, so plain sitevision-scripts works as well.

### Editing in the Config tab

Every field is saved as soon as you press `Enter` on it; there is no separate
save step. Secret rows (password, client secret, signing password) write to the
keychain, never to the file. Leaving a secret empty and pressing `Enter`
removes it from the keychain.

The **SOURCE** column shows where each value comes from:

- `local` – set in this app's own file
- `↑ root` – inherited from a `.dev_properties.json` further up
- `package.json` – a default from `package.json`
- `↑ dev` / `<env>` – on a non-base environment: inherited from the base, or
  overridden here
- `manifest.json` – a field of the app's manifest
- `keychain` – a secret is stored
- `✗ required` – missing
- `≠ manifest` – on **Addon name**: it is none of the manifest's names

The addon name and the manifest name are two different things. The addon is an
object in the site's Addon Repository, and every deploy goes to it by name; the
manifest name is a label inside the zip. `svc` never changes one to match the
other, it only points the difference out, here and under **PACKAGE.JSON SYNC**.
To make them match, rename the addon in Sitevision (Addons, General, Settings)
and pick it again with `Ctrl+O`. For a RESTApp the addon name is part of its
endpoint URL, so renaming it changes that URL. The hint is not shown on a
non-base environment, where a different addon name is usually intended.

The **MANIFEST** section edits `manifest.json` itself: id, version, name,
description, author and help URL. A localized name or description gets one row
per language. Values are replaced in place, so comments and formatting in the
file survive; adding or removing a field in a manifest with comments has to be
done by hand.

Below the form, **PACKAGE.JSON SYNC** lists the shared values in this
directory's `.dev_properties.json` that `package.json` does not provide yet,
either here or in a `package.json` further up. `y` copies them into
`package.json` so they can be committed. User-specific fields are never copied,
not even from inside `environments`. For an app it also lists the manifest's
`version`, `description` and `author` when the app's `package.json` differs;
the manifest wins, and an `author` object in `package.json` is left alone. The same section and `y` work in
**Workspace settings**, against the root `package.json`. When the workspace root has no `package.json`
yet, the section says so and `y` creates one. If `package.json` cannot be read
or written, `svc` shows a warning instead of saving.

### Shared config in a workspace

Inheritance between directories is a `svc` feature. For an app, each value is
looked up in this order, and the first match wins:

1. The app's own `.dev_properties.json`, if it has one
2. `.dev_properties.json` in parent directories, up to the repository root (the
   directory containing `.git`)
3. The app's `package.json`
4. `package.json` in parent directories, up to the repository root

Recommended layout:

```
repo/
  package.json              ← shared: developmentDomain, siteName, "svc": {authMethod, oauth2, environments}   committed
  .dev_properties.json      ← yours: username, signingUsername                                              ignored
  webapps/
    news/package.json       ← "addonName": "news"                                                          committed
    search/package.json     ← "addonName": "search"                                                        committed
```

In workspace mode `svc` never creates a `.dev_properties.json` inside an app.
Saving in an app's Config tab writes to the root `.dev_properties.json`, except
the addon name, which goes to the app's `package.json`. An app that already has
its own `.dev_properties.json` keeps using it. Shared values changed this way
can then be copied to the root `package.json` with `y` in **Workspace
settings** (last row in the navigator, or the palette).

Plain sitevision-scripts only reads the app's own `.dev_properties.json`, so
inside a workspace it does not see inherited values.

Because keychain entries are keyed by domain and username, one login covers
every app on the same site.

### `.svcconfig`

A small file of CLI preferences, in the app root or workspace root. No secrets.

```json
{
	"environment": "test"
}
```

- `environment` – the last environment picked with `v`

### Global settings

Settings that belong to you rather than to a project live in
`~/.config/sitevision-cli/config.json` (or `$XDG_CONFIG_HOME/sitevision-cli/`):

```json
{
	"language": "sv",
	"introAnimation": false,
	"updateCheck": false,
	"warnings": {"addonNameDrift": false},
	"signingUsername": "me@example.com",
	"certificateName": "My certificate"
}
```

- `language`, `introAnimation` – as before
- `updateCheck` – `false` stops the check for a newer `svc` at start
- `warnings.addonNameDrift` – `false` hides the `≠ manifest` hint
- `signingUsername`, `certificateName` – the signing identity for every project
  that does not set its own. A project's `.dev_properties.json` wins, and the
  Config tab shows `global` as the source. Set them with
  `svc setup-signing --global`. A project with no deploy config at all does not
  pick them up.

Edit all of them with `,` in the shell, or edit the file by hand; comments
are allowed, but `svc` drops them the next time it saves. If the file does not
parse, `svc` says so, uses the defaults and leaves the file alone until it is
fixed.

## 5. Authentication

### Two separate credentials

`svc` talks to **two different services**, each with its own account:

| Credential  | Used for                                        | Host                      | Auth                          | Configured with          |
| ----------- | ----------------------------------------------- | ------------------------- | ----------------------------- | ------------------------ |
| **Deploy**  | Deploy, list and activate versions, list addons | Your site (`domain`)      | `basic`, `oauth2` or `cookie` | `username`, `authMethod` |
| **Signing** | Signing the zip                                 | `developer.sitevision.se` | Always username + password    | `signingUsername`        |

They are unrelated. Logging in to your site with SSO does nothing for signing,
and the signing password is never sent to your site.

### Where secrets are kept

Nothing secret is ever written to `.dev_properties.json`, `.svcconfig` or any
other file. Everything lives in the OS keychain under the service name
`sitevision-cli`:

| Keychain account                     | Content                          | Created when                                                        |
| ------------------------------------ | -------------------------------- | ------------------------------------------------------------------- |
| `deploy:<username>@<domain>`         | Deploy password (`basic`)        | You enter it in Config, or tick "Save to OS keychain" at the prompt |
| `signing:<signingUsername>`          | Signing password                 | Same, for signing                                                   |
| `oauth2-refresh:<clientId>@<domain>` | OAuth2 refresh token             | After a successful OAuth2 login (if the provider issues one)        |
| `oauth2-secret:<clientId>@<domain>`  | OAuth2 client secret             | You enter it in Config                                              |
| `session:<username>@<domain>`        | Captured browser session cookies | After a successful cookie login                                     |

OAuth2 access tokens are never stored. They are held in memory for the
lifetime of the shell (or the single command) and fetched again next time using
the refresh token.

Within one shell session a credential is asked for at most once per site, then
reused by every action and every app on that site.

**Log out** (palette) removes the deploy password, the session cookie and the
refresh token for the active site. The signing password and the OAuth2 client
secret stay; clear those by emptying the fields in Config.

### Order of lookup

**Deploy password (`basic`)**

1. `SITEVISION_DEPLOY_PASSWORD`
2. Keychain `deploy:<username>@<domain>`
3. Prompt, with an option to save to the keychain

**Signing password**

1. `SITEVISION_SIGNING_PASSWORD`
2. Keychain `signing:<signingUsername>`
3. Prompt, with an option to save to the keychain

**OAuth2 access token**

1. `SITEVISION_ACCESS_TOKEN`
2. Silent refresh with the keychain refresh token
3. Browser login

**Session cookie**

1. `SITEVISION_SESSION_COOKIE`
2. Keychain `session:<username>@<domain>`
3. Browser login

If a request carries more than one kind of credential, the cookie wins over a
bearer token, which wins over basic.

### Method: `basic`

Username and password sent as HTTP Basic auth on every request.

Use it when the account is a local Sitevision account (not federated SSO).

Setup: set `username`, leave `authMethod` as `basic`, and either enter the
password in the Config tab or wait for the prompt on the first deploy.

### Method: `oauth2`

A bearer token from the site's own OAuth2 provider, obtained with the
authorization-code flow with PKCE in your normal browser. Works with SSO
accounts.

**What happens at login**

1. `svc` starts a small server on `http://127.0.0.1:8137`.
2. Your browser opens the site's authorization page. You log in (SSO included)
   and approve.
3. The browser is redirected back to `http://127.0.0.1:8137/callback`; the page
   says you can close it.
4. `svc` exchanges the code for an access token and, when the provider issues
   one, a refresh token which goes into the keychain.
5. Next time, `svc` uses the refresh token silently and no browser opens. If
   the provider rejects the refresh token (expired or revoked) it is deleted and
   the browser login runs again. A network error or a server error leaves it
   in place.

Both endpoints must be `https` URLs, and the token endpoint must be on the
site's own domain (the `domain` of the environment). The endpoints can come
from a committed `package.json`, and the refresh token and client secret are
only ever sent to the site they were stored for. Plain `http` is accepted only
together with `useHTTPForDevDeploy`.

If the browser does not open, the login screen prints the URL to open by hand.
`Esc` cancels and frees the port. The login times out after five minutes.

**Site side (Sitevision admin)**

These steps are done once per site by someone with admin rights:

1. Enable the **OAuth2 provider** on the site and **save** the configuration.
   The discovery document at `https://<domain>/.well-known/openid-configuration`
   is only published after it has been saved.
2. Create a **client**:
   - Redirect URI: `http://127.0.0.1:8137/callback` (exactly)
   - Grant types: `authorization_code` and `refresh_token`
   - Scopes: include `ALL` and `offline_access`
   - A client secret is optional. If the client has one, every developer must
     enter it in `svc` (see below).
3. Hand the **client id** (and secret, if any) to the developers.

**CLI side**

1. In the Config tab set **Auth method** to `oauth2`.
2. Enter the **OAuth2 client id**.
3. The **authorization** and **token endpoints** are filled in automatically
   from the site's discovery document. If discovery fails, enter them by hand:
   `https://<domain>/oauth2-provider/authorize` and
   `https://<domain>/oauth2-provider/token`.
4. **Scopes** default to `ALL offline_access`.
5. **Client secret**: enter it only if the client has one.
6. Press `l`, or just deploy; the login starts when it is needed.

Resulting config (the secret is not in it):

```json
{
	"domain": "acme-use.sitevision-cloud.se",
	"siteName": "Intranet",
	"addonName": "my-addon",
	"username": "me@acme.se",
	"authMethod": "oauth2",
	"oauth2": {
		"clientId": "svc-cli",
		"authorizationEndpoint": "https://acme-use.sitevision-cloud.se/oauth2-provider/authorize",
		"tokenEndpoint": "https://acme-use.sitevision-cloud.se/oauth2-provider/token",
		"scopes": ["ALL", "offline_access"]
	}
}
```

**Pitfalls**

| Symptom                                                 | Cause and fix                                                                                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Could not discover OAuth2 endpoints"                   | The provider is not enabled, or its config was never saved. Save it on the site, or enter the endpoints by hand.                                               |
| `invalid_scope` … "not present in client configuration" | Scope casing must match the client exactly. The discovery document may list `all` while the client is configured with `ALL`. Use what the client has.          |
| `401 invalid_client` "Client authentication failed"     | The client has a secret and `svc` did not send it. Enter **Client secret** in Config. `svc` treats the client as public when no secret is stored.              |
| Redirect error in the browser                           | The redirect URI on the client is not exactly `http://127.0.0.1:8137/callback`.                                                                                |
| Login in the browser every time                         | No refresh token: add `offline_access` to the scopes, and allow the `refresh_token` grant on the client.                                                       |
| "Local login server error … EADDRINUSE"                 | Something else uses port 8137. Free it, or set `"redirectPort"` under `oauth2` in `.dev_properties.json` and register the matching redirect URI on the client. |

The provider offers no client-credentials grant, so there is no fully
unattended login: the first login always goes through a browser. For CI, see
[8](#8-direct-commands-and-ci).

### Method: `cookie`

Reuses a real browser session. For sites where SSO/SAML is the only way in and
no OAuth2 client is available.

**What happens at login**

1. `svc` opens a separate Google Chrome window at the site root (or
   `sessionLoginUrl`). Chrome must be installed.
2. You log in there, SSO included, and wait until the site itself has loaded.
3. You go back to the terminal and press `Enter`.
4. `svc` reads the browser's cookies, picks the `JSESSIONID` session for your
   site and every cookie on that host, stores them in the keychain and closes
   the window.

If no session is found, the message lists which cookie domains were seen and
the window stays open, so you can navigate to a site page and press `Enter`
again. `Esc` cancels.

Sessions expire. A stale session rarely answers with a clean 401; `svc` treats
a redirect or an HTML login page as expired, deletes the stored cookie and asks
you to log in again.

**Setup:** set **Auth method** to `cookie`, optionally a **Login URL**, then
press `l` or deploy.

**Pitfalls**

- "Could not open a login browser (is Chrome installed?)" – install Chrome, or
  use the manual path below.
- Some identity providers (conditional access, device trust) refuse a browser
  started this way. Log in in your normal browser instead, copy the cookie
  header from the developer tools and pass it in `SITEVISION_SESSION_COOKIE`.

### Which method works where

|                                                    | `basic`                   | `oauth2`                            | `cookie`                                                              |
| -------------------------------------------------- | ------------------------- | ----------------------------------- | --------------------------------------------------------------------- |
| Shell (`svc`): deploy, dev, versions, addon picker | prompt                    | browser login                       | browser login                                                         |
| `svc deploy`                                       | prompt                    | refresh token, else browser login   | keychain cookie, else browser login                                   |
| `svc dev`                                          | prompt                    | only with `SITEVISION_ACCESS_TOKEN` | keychain cookie from an earlier login, or `SITEVISION_SESSION_COOKIE` |
| `svc watch`                                        | not needed (no deploy)    | not needed                          | not needed                                                            |
| Signing (`s`, `svc sign`, `--signed`)              | separate signing password | separate signing password           | separate signing password                                             |

In practice: with `oauth2` or `cookie`, run dev from the shell.

An OAuth2 access token lives for as long as the provider allows. If a
long-running dev session starts failing with "Unauthorized", press `l` to log in
again.

### Old plaintext passwords

Earlier versions stored `password` in `.dev_properties.json`. When one is
found, `svc` offers to move it to the keychain and remove it from the file: as
a prompt before a direct command, or as **Migrate password to OS keychain** in
the palette. Until migrated, the plaintext value is still used.

## 6. Environments and production

The top-level fields are one environment, named `dev` unless `baseEnvironment`
says otherwise. Add others under `environments` with only the fields that
differ:

```json
{
	"domain": "acme-use.sitevision-cloud.se",
	"siteName": "Intranet",
	"username": "me@acme.se",
	"signingUsername": "me@acme.se",
	"environments": {
		"test": {"domain": "acme-tse.sitevision-cloud.se"},
		"prod": {
			"domain": "acme.sitevision-cloud.se",
			"authMethod": "oauth2",
			"oauth2": {
				"clientId": "svc-cli",
				"authorizationEndpoint": "…",
				"tokenEndpoint": "…"
			}
		}
	}
}
```

An environment may override `domain`, `siteName`, `addonName`, `username`,
`authMethod`, `oauth2`, `sessionLoginUrl`, `useHTTPForDevDeploy` and
`production`. Signing settings are shared by all environments.

In the shell:

- `v` cycles environments; **Add environment** in the palette creates one.
  The choice is remembered in `.svcconfig`.
- Deploy, Versions, the auth state and the Config tab all follow the active
  environment. On a non-base environment the Config tab edits that
  environment's overrides.
- Credentials are looked up for the environment's own domain and username, so
  each environment has its own login.

**Production environments**

An environment is production when:

- it is under `environments` and its name contains `prod`, unless it says
  `"production": false`; or
- it has `"production": true`.

The base environment is only production with `"production": true`, never by
name, so a repository whose only site is production can set
`"baseEnvironment": "prod"` and still use dev.

On a production environment:

- `p` deploys the **signed** zip (`dist/<id>-signed.zip`), asks for
  confirmation, and **activates** the new version.
- `d` (dev) refuses to run.

Direct commands (`svc deploy` etc.) always use the base environment; switching
environments is only available in the shell.

## 7. Build, sign, deploy

### Build

| App                                      | How it is built                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `bundled: true`, no `webpack.config.js`  | Delegated to `@sitevision/sitevision-scripts build` (8.x) in the project's `node_modules`. |
| `bundled: true`, own `webpack.config.js` | Compiled with the project's webpack.                                                       |
| Not bundled                              | `src/` and `static/` copied as-is.                                                         |

The result is `dist/<manifest id>.zip`. Run `i` (`npm install`) first if
dependencies are missing; the Overview tab shows it. Dependencies hoisted to
the repository root (npm, pnpm or yarn workspaces) are found too.

The zip must contain a `manifest.json`, or the build fails. Keep it in `static/`
(or `src/` for an app that is not bundled); a `manifest.json` at the app root is
copied in when neither folder has one.

### Sign

Uploads `dist/<id>.zip` to developer.sitevision.se and writes
`dist/<id>-signed.zip`. Needs `signingUsername` and the signing password.
Network errors and server errors are retried, up to three attempts.

### Deploy

Uploads the zip to the addon's import endpoint on the active environment's
site. `P` (force) overwrites an existing version with the same number. On
production, see [6](#6-environments-and-production).

### Dev and watch

Both build once, then watch `src`, `static`, `i18n`, `resource`, `config` and
`manifest.json` and rebuild on change.

- If `signingUsername` is set, each build is signed.
- Dev then deploys (force) each build. Watch does not.
- Builds never overlap: changes made during a build, sign or deploy are picked
  up in one more run afterwards, so the last save is what ends up deployed.
- With the project's own `webpack.config.js`, webpack watches what it bundles;
  `svc` watches `static/` and `manifest.json` next to it.
- Output goes to the Log tab. `K` stops.

## 8. Direct commands and CI

Every command runs in the current app directory and uses the base environment.

```bash
svc build [--no-zip]
svc sign
svc deploy [--force] [--production [--activate]]
svc dev [--signed]
svc watch [--signed]
svc info
svc setup-signing
```

| Flag           | Short | Command         | Effect                                                          |
| -------------- | ----- | --------------- | --------------------------------------------------------------- |
| `--no-zip`     |       | `build`         | Build into `build/` and leave no zip                            |
| `--force`      | `-f`  | `deploy`        | Overwrite an existing version with the same number              |
| `--production` | `-p`  | `deploy`        | Upload the signed zip instead of the dev zip                    |
| `--activate`   | `-a`  | `deploy`        | With `--production`: activate the uploaded version              |
| `--signed`     | `-s`  | `dev`, `watch`  | Sign after each build                                           |
| `--minimal`    |       | (shell)         | Compact layout, see [3](#3-the-shell)                           |
| `--global`     |       | `setup-signing` | Save for every project, see [Global settings](#global-settings) |
| `--debug`      |       | (any)           | Write a debug log, see [Debug log](#debug-log)                  |

An unknown flag is an error, so a misspelt `--production` never turns into a
dev deploy.

- `svc deploy --production` uploads the signed zip. It only activates with
  `--activate` (the shell always activates on production). When `--activate`
  was asked for and the activation fails, the command fails, even though the
  upload went through.
- `svc sign` asks whether to use the signing password saved in the keychain.
- `svc setup-signing` asks for the signing username and certificate name and
  saves them in `.dev_properties.json`. Nothing else in the file is touched.
  With `--global` they go to the global settings file instead.
- Build, sign and deploy print their log line by line and then exit by
  themselves. They run the same steps as the shell's `b`, `s` and `p`.

**Exit codes**

| Code  | Meaning                                                         |
| ----- | --------------------------------------------------------------- |
| `0`   | Done                                                            |
| `1`   | Failed, or something needed was missing (config, password, zip) |
| `2`   | Unknown flag                                                    |
| `130` | A password prompt was cancelled with `Ctrl+C`                   |

So `svc build && svc sign && svc deploy` stops at the first step that fails.

**Without a terminal**

All commands run with piped input and output. Nothing is asked then: a missing
password is an error (set the variables below), and an `oauth2` or `cookie`
login that would need a browser is an error too. The check for a newer `svc`
version is skipped when output is not a terminal or `CI` is set.

**Environment variables**

| Variable                               | Effect                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `SITEVISION_DEPLOY_PASSWORD`           | Deploy password; skips keychain and prompt                                      |
| `SITEVISION_SIGNING_PASSWORD`          | Signing password; skips keychain and prompt                                     |
| `SITEVISION_ACCESS_TOKEN`              | OAuth2 bearer token (when `authMethod` is `oauth2`)                             |
| `SITEVISION_SESSION_COOKIE`            | Cookie header (when `authMethod` is `cookie`)                                   |
| `SITEVISION_APP_ID_PREFIX` / `_SUFFIX` | Added around the manifest id in zip names; `APP_ID_PREFIX` / `_SUFFIX` work too |
| `SVC_NO_KEYCHAIN`                      | `1` turns the OS keychain off: nothing is read from it or saved to it           |
| `SVC_DEBUG`                            | `1` writes a debug log, same as `--debug`                                       |
| `CI`                                   | When set, the check for a newer `svc` version is skipped                        |
| `XDG_CONFIG_HOME`                      | Location of the global settings                                                 |

Environment variables are never written anywhere. `SVC_NO_KEYCHAIN=1` suits CI
machines without a keychain service; passwords then come from the variables
above.

**CI example (basic auth)**

```bash
export SITEVISION_DEPLOY_PASSWORD=…     # from the CI secret store
export SITEVISION_SIGNING_PASSWORD=…
svc build && svc sign && svc deploy --production --activate
```

For `oauth2`, there is no unattended login; obtain a token some other way and
pass it with `SITEVISION_ACCESS_TOKEN`. A local, non-federated service account
with `basic` is usually the simplest choice for CI.

## 9. Troubleshooting

| Message                                                        | What to do                                                                                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| "No Sitevision apps found here."                               | Run inside an app, or at a repository root with apps at most three levels down.                                                               |
| "Unauthorized. Check username and password."                   | Wrong deploy password. **Log out** in the palette, then deploy again to be asked.                                                             |
| "Unauthorized. The access token was rejected or has expired."  | Press `l` to log in again.                                                                                                                    |
| "Unauthorized. The session cookie was rejected or has expired" | Press `l`; a new browser login runs.                                                                                                          |
| "Zip not found … Run build first."                             | `b` first. For production: `b` then `s`.                                                                                                      |
| "Conflict. Addon already exists."                              | Use force deploy (`P` / `--force`).                                                                                                           |
| "Dev never deploys to a production environment"                | Switch environment with `v`, or use `w` (watch).                                                                                              |
| Keys do nothing                                                | Focus is in the navigator, where typing filters. Press `Enter` or `Tab`.                                                                      |
| Password prompt every time                                     | Tick **Save to OS keychain** at the prompt, or enter the password in the Config tab.                                                          |
| "No token/cookie available" from `svc dev`                     | Run dev from the shell instead, or set `SITEVISION_ACCESS_TOKEN` / `SITEVISION_SESSION_COOKIE`. See the table in [5](#5-authentication).      |
| "Deploy config is missing …"                                   | The named setting is empty for this app and environment. Press `e` and fill it in, or add it to `.dev_properties.json`.                       |
| "Skipped: … manifest.json is missing …"                        | That app's manifest lacks `id`, `version` or `type` (or is not valid JSON), so it is left out of the workspace. Fix the manifest and restart. |
| "… has no manifest.json, so the zip would not be an app"       | Put `manifest.json` in `static/` (or `src/` for an app that is not bundled).                                                                  |
| "Could not save to the OS keychain"                            | No keychain service is reachable, so you will be asked again next time. On CI, set the password variables and `SVC_NO_KEYCHAIN=1`.            |
| "OAuth2 token endpoint is on …, not on …"                      | The token endpoint must be on the site's own domain. See [oauth2](#method-oauth2).                                                            |
| "Deployed successfully but activation failed"                  | The new version is uploaded but the old one is still active. Activate it from the Versions tab (`a`), or fix the permission and deploy again. |
| `≠ manifest` on Addon name                                     | The addon name is none of the manifest's names. See [Editing in the Config tab](#editing-in-the-config-tab).                                  |

### Debug log

`svc --debug` (or `SVC_DEBUG=1`) writes everything svc does during the run to
`debug.log` next to the global settings, and prints the path on exit. The log
holds every action you run in the shell or as a command, every task and its
output, every request to Sitevision (method, host, path, status and time),
every child process, every config write and every keychain lookup. It never
holds passwords, tokens or cookies, but it does name your site, username and
file paths, so read through it before attaching it to a bug report. The file
is replaced on every run.

## Reference

**Files**

| File                                    | Contains                                       | Commit? |
| --------------------------------------- | ---------------------------------------------- | ------- |
| `.dev_properties.json`                  | Your config, including user-specific values    | No      |
| `package.json`                          | Shared defaults (top-level fields and `"svc"`) | Yes     |
| `.svcconfig`                            | Active environment                             | No      |
| `~/.config/sitevision-cli/config.json`  | Global settings, default signing identity      | –       |
| `dist/<id>.zip`, `dist/<id>-signed.zip` | Build output                                   | No      |
| OS keychain, service `sitevision-cli`   | All secrets                                    | –       |
