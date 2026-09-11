# Sitevision CLI

This CLI was largely built on the back of the [sitevision-scripts](https://github.com/sitevision/sitevision-scripts) project.
However, these scripts have some limitations:

- Clunky for use with environments requiring signed packages
- Clunkly management of credentials and unsecure handling of credentials
- No type safety

## Features

- **Interactive Menu** - Full-screen TUI with arrow key navigation
- **Project Detection** - Automatically detects Sitevision projects
- **Two Modes** - Interactive menu OR direct command execution
- **Automatic Setup** - Guided setup for dev properties and signing credentials
- **Secure Credentials** - Passwords live in the OS keychain (macOS Keychain / Windows Credential Manager / Linux libsecret), never on disk

## Install

```bash
npm install --global sitevision-cli
```

## Usage

The CLI must be run inside a Sitevision project directory (containing a `manifest.json`).

### Interactive shell

Run `svc` with no arguments to open the full-screen shell. It works in two
places:

- **Inside an app** (a directory with `manifest.json`): single-app mode.
- **At the root of a repo** that contains apps in subfolders such as
  `webapps/*`, `restapps/*` or `widgets/*`: workspace mode, with every app in
  the left navigator and per-app status dots (dependencies, config,
  package.json sync, signing).

The right pane has four tabs: **Overview**, **Config** (the whole
`.dev_properties.json` as one form, plus signing and keychain secrets; `Tab`
moves between fields, `Enter` saves, `Ctrl+O` on the addon field picks an
addon from the site's Addon Repository), **Versions** (the versions uploaded
to the site, `a` activates one) and **Log** (streaming build and deploy
output). Dev and watch keep running in the background while you navigate
between apps.

Single-letter keys drive everything; the bottom bar shows the ones that apply.
`/` opens the command palette with every action, `Tab` switches between the
navigator and the content pane, `1`–`4` pick a tab, `q` quits.

| Key             | Action                                                            |
| --------------- | ----------------------------------------------------------------- |
| `d` / `w`       | Dev (build, sign, deploy on change) / Watch (build and sign only) |
| `b` / `s`       | Build / Sign                                                      |
| `p` / `P`       | Deploy to dev / force deploy                                      |
| `a`             | Versions tab: list and activate remote versions                   |
| `e` / `y` / `l` | Edit dev properties / apply package.json sync / log in            |
| `K`             | Stop the running task for the selected app                        |

### Shared configuration in a workspace

`.dev_properties.json` is resolved by merging every ancestor directory's file
(up to the repo root) under the app's own file, nearest wins. Put the shared
fields (`domain`, `siteName`, `username`, `authMethod`, `oauth2`,
`signingUsername`, ...) once at the repo root and keep only `addonName` in each
app. The Config tab marks inherited values with `↑ root`, and saving an app's
config never copies inherited values into the app file. Keychain entries are
keyed by domain and username, so one login covers every app on the site.

### Direct Commands

You can also run commands directly:

#### Development

```bash
# Start development server with watch mode
svc dev

# Start development server with automatic signing
svc dev --signed
```

#### Building

```bash
# Build the application for production
svc build
```

#### Signing

```bash
# Sign the app for production deployment
svc sign
```

#### Deployment

```bash
# Deploy to development server
svc deploy

# Force deploy (overwrite existing)
svc deploy --force

# Deploy to production (requires signed app)
svc deploy --production
```

#### Setup

```bash
# Configure signing credentials
svc setup-signing
```

#### Project Info

```bash
# Show project information and configuration
svc info
```

## Configuration

### Development Properties (`.dev_properties.json`)

Create this file in your project root for deployment configuration:

```json
{
	"domain": "your-site.sitevision.se",
	"siteName": "YourSite",
	"addonName": "your-addon",
	"username": "your-email@example.com",
	"useHTTPForDevDeploy": false,
	"signingUsername": "your-developer-account@example.com",
	"certificateName": "optional-certificate-name"
}
```

### Keeping `package.json` in sync

`sitevision-scripts` reads `developmentDomain`, `siteName` and `addonName`
from `package.json`, which duplicates three fields of
`.dev_properties.json`. When they disagree — or when a fresh setup has just
written `.dev_properties.json` — `svc` shows the differences and offers to
update `package.json` from `.dev_properties.json`. Nothing is written without
confirmation, and `.dev_properties.json` is always the source of truth for
the copy. Existing indentation and unrelated fields are left alone.

After answering, `svc` offers to remember the choice in a `.svcconfig` file
in the project root:

```json
{
	"syncPackageJson": true
}
```

With `true`, `svc` updates `package.json` automatically without asking; with
`false`, the check is skipped entirely. Delete the key (or the file) to be
asked again. The file contains no secrets, so it is safe to commit.

### Password storage

Passwords are stored in the OS-native secret store (macOS Keychain, Windows
Credential Manager, Linux libsecret) under the `sitevision-cli` service —
never in `.dev_properties.json`. Run `svc` and complete the setup form (or
enter the password when prompted at deploy/sign time and toggle "save to
keychain") to populate it.

If an existing `.dev_properties.json` contains a plaintext `password` field,
the CLI offers to migrate it to the keychain on next launch and strip the
field from the file. The migration prompt only appears in interactive mode
(plain `svc`) — if you only ever invoke commands directly (`svc deploy`,
`svc dev`), run `svc` once to migrate.

For CI / headless use, set `SITEVISION_DEPLOY_PASSWORD` and/or
`SITEVISION_SIGNING_PASSWORD` — these take precedence over the keychain and
are never written anywhere.

### Signing Credentials

Signing credentials are used to sign apps via developer.sitevision.se:

- `signingUsername` - Your developer.sitevision.se account
- `certificateName` - Optional, if you have multiple certificates

The signing password is prompted on first use, with an option to save it to
the OS keychain for future runs.

## License

MIT
