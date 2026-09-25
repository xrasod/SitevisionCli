# Sitevision CLI

[![Test](https://github.com/xrasod/SitevisionCli/actions/workflows/test.yml/badge.svg)](https://github.com/xrasod/SitevisionCli/actions/workflows/test.yml)
[![npm](https://img.shields.io/npm/v/sitevision-cli)](https://www.npmjs.com/package/sitevision-cli)

`svc` builds, signs and deploys Sitevision apps (WebApp, Widget, RESTApp,
MCPServer) from a full-screen terminal shell or as plain commands.

- **One shell for one app or a whole repo.** Run it inside an app, or at the
  root of a repo with many apps and switch between them. Dev and watch keep
  running in the background.
- **Three ways to authenticate deploys:** username and password, OAuth2 (PKCE,
  works with SSO), or a captured browser session for SAML-only sites.
- **No secrets on disk.** Passwords, tokens and cookies live in the OS keychain.
- **Environments.** dev, test and prod in one config; production deploys use
  the signed zip, confirm, and activate only if you say so.
- **Shared config in git.** Site and auth settings for the whole team live in
  `package.json`, once at the repo root; your username stays in a local
  `.dev_properties.json`. Compatible with plain sitevision-scripts.
- **Builds the way Sitevision does.** Bundled apps without their own webpack
  config are built by `@sitevision/sitevision-scripts`.
- English and Swedish UI.

📖 **[User guide](docs/user-guide.md)** · **[Användarguide (svenska)](docs/anvandarguide.md)**

## Install

Requires Node.js 22+.

```bash
npm install --global sitevision-cli
```

## Quick start

```bash
cd my-repo          # or cd into a single app
svc
```

1. Pick an app in the navigator and press `Enter`. (In a new repo the shell
   opens on **Workspace settings** first.)
2. Press `2` for the **Config** tab and fill in domain, site name, addon name,
   username and auth method. Each field saves on `Enter`.
3. Press `i` to install dependencies if needed, then `d` to start dev: build on
   every change and deploy. Output is in the **Log** tab (`4`).

For production: switch environment with `v`, press `b` to build, `s` to sign
and `p` to deploy. It asks whether to activate the new version or just upload it.

## The shell

| Key             | Action                                              |
| --------------- | --------------------------------------------------- |
| `d` / `w`       | Dev (build + deploy on change) / Watch (build only) |
| `b` / `s`       | Build / Sign                                        |
| `p` / `P`       | Deploy / force deploy to the active environment     |
| `a`             | Versions: list and activate uploaded versions       |
| `v`             | Switch environment                                  |
| `e` / `y` / `i` | Config tab / sync `package.json` / `npm install`    |
| `l`             | Log in again                                        |
| `K`             | Stop running tasks                                  |
| `1`–`4`         | Overview · Config · Versions · Log                  |
| `/`             | Command palette                                     |
| `?`             | Help: every key in one place                        |
| `,`             | Settings (language, update check, hints)            |
| `Tab` / `Esc`   | Switch pane / back                                  |
| `q`             | Quit                                                |

In the navigator, typing filters the app list; action keys work once `Enter` or
`Tab` has moved focus to the content pane. The bottom bar always shows the keys
that apply. `svc --minimal` gives a compact layout for small panes.
`svc --debug` writes a log of everything svc does, for bug reports.

## Commands

```bash
svc                                   # interactive shell
svc build [--no-zip]                  # build to dist/<id>.zip
svc sign                              # sign to dist/<id>-signed.zip
svc deploy [--force]                  # deploy the zip
svc deploy [--production] [--activate]  # signed zip only / activate after
svc dev [--signed]                    # build + deploy on change
svc watch [--signed]                  # build on change, no deploy
svc info                              # project information
svc setup-signing [--global]          # save the signing username and certificate
```

Short flags: `-f` force, `-p` production, `-a` activate, `-s` signed. An unknown
flag is an error.

Direct commands use the base environment, run without a terminal, and exit
non-zero when a step fails, so `svc build && svc sign && svc deploy -p -a` is
safe in CI. `SITEVISION_DEPLOY_PASSWORD` and `SITEVISION_SIGNING_PASSWORD`
supply the passwords; `SITEVISION_ACCESS_TOKEN` and `SITEVISION_SESSION_COOKIE`
pass an OAuth2 token or session cookie for one run.

## Configuration

`.dev_properties.json` is your local config and the main source; keep it out of
git. Shared values are committed in `package.json` and act as defaults
underneath it:

```json
{
	"developmentDomain": "acme-use.sitevision-cloud.se",
	"siteName": "Intranet",
	"addonName": "my-addon",
	"svc": {
		"authMethod": "oauth2",
		"environments": {"prod": {"domain": "acme.sitevision-cloud.se"}}
	}
}
```

`username`, `signingUsername` and `certificateName` are user-specific and only
live in `.dev_properties.json`. `y` copies shared values from
`.dev_properties.json` into `package.json`. In a workspace, shared values go in
the root `package.json` and each app's `package.json` only needs `addonName`.

## Authentication in short

There are two separate credentials:

- **Deploy**: your account on the site. `authMethod` is `basic` (password),
  `oauth2` (browser login against the site's OAuth2 provider, refreshed
  silently afterwards) or `cookie` (log in with SSO in a Chrome window, the
  session is captured).
- **Signing**: your developer.sitevision.se account, always username and
  password.

Everything secret goes in the OS keychain under `sitevision-cli`. For CI, set
`SITEVISION_DEPLOY_PASSWORD`, `SITEVISION_SIGNING_PASSWORD`,
`SITEVISION_ACCESS_TOKEN` or `SITEVISION_SESSION_COOKIE`.

OAuth2 needs a client registered on the site with the redirect URI
`http://127.0.0.1:8137/callback`. The [user guide](docs/user-guide.md#5-authentication)
covers the setup, the pitfalls, and which method works with which command.

## Development

```bash
npm install
npm run build   # tsc → dist/
npm test        # prettier, xo, ava
```

To run your local build as `svc`, link it once with `npm link`, then keep
`npm run dev` running in the repo: every save recompiles `dist/`, so `svc` in
any Sitevision app reflects your changes. `npm unlink -g sitevision-cli` and
`npm install -g sitevision-cli` restore the published version.

Contributing: see [CONTRIBUTING.md](CONTRIBUTING.md). Releasing: see
[RELEASING.md](RELEASING.md).

## License

MIT
