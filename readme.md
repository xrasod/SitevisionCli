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

### Interactive Mode

Simply run `svc` to launch the interactive menu:

```bash
svc
```

On first run (or if setup is incomplete), the CLI will:

1. Check if `node_modules` exists and offer to run `npm install` if missing
2. Check if dev properties are configured and offer to set them up if missing
3. Check if you have setup signing credentials and offer to do so if missing
4. Display project information
5. Show the main menu

Use arrow keys to navigate and Enter to select:

- **Dev** - Start development server with watch mode
- **Dev (Signed)** - Development with automatic signing before each deploy
- **Build** - Build a dist bundle
- **Sign** - Sign built dist bundle
- **Deploy** - Deploy to configured development environment
- **Deploy (Force)** - Force deploy (overwrite existing)
- **Deploy Production** - Deploy signed app to configured production environment
- **Info** - Show project info
- **Exit**

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
