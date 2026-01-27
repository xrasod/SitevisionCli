# Sitevision CLI

This CLI was largely built on the back of the [sitevision-scripts](https://github.com/sitevision/sitevision-scripts) project.
However, these scripts have some limitations:
- Clunky for use with environments requiring signed packages
- Clunkly management of credentials and unsecure handling of credentials
- No type safety

## Features

- **Interactive Menu** - Full-screen TUI with arrow key navigation
- **Project Detection** - Automatically detects Sitevision projects
- **Webpack Integration** - Built-in webpack bundling for development and production
- **App Signing** - Sign apps via developer.sitevision.se for production deployment
- **Live Feedback** - Real-time status updates and progress indicators
- **Two Modes** - Interactive menu OR direct command execution
- **Automatic Setup** - Guided setup for dev properties and signing credentials
- **Secure Credentials** - Passwords can be entered per-session (not stored on disk)

## Install

```bash
npm install --global @sitevision/cli
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
3. Display project information
4. Show the main menu

Use arrow keys to navigate and Enter to select:
- **Dev** - Start development server with watch mode
- **Dev (Signed)** - Development with automatic signing before each deploy
- **Build** - Build for production
- **Sign** - Sign the app for production deployment
- **Deploy** - Deploy to dev server
- **Deploy (Force)** - Force deploy (overwrite existing)
- **Deploy Production** - Deploy signed app to production
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
  "password": "",
  "useHTTPForDevDeploy": false,
  "signingUsername": "your-developer-account@example.com",
  "certificateName": "optional-certificate-name"
}
```

**Note:** You can leave `password` empty - the CLI will prompt for it securely at runtime and store it in session memory only.

### Signing Credentials

Signing credentials are used to sign apps via developer.sitevision.se:
- `signingUsername` - Your developer.sitevision.se account
- `certificateName` - Optional, if you have multiple certificates

The signing password is never stored on disk - it's prompted for each session.

## Architecture





### Directory Structure

```
source/
├── cli.tsx                    # CLI entry point and argument parsing
├── app.tsx                    # Main app component and state management
├── commands/                  # Command implementations
│   ├── types.ts              # Command type definitions
│   ├── index.ts              # Command exports
│   ├── dev.tsx               # Development server with watch mode
│   ├── build.tsx             # Production build
│   ├── deploy.tsx            # Deployment to dev/production
│   ├── sign.tsx              # App signing
│   ├── setup-signing.tsx     # Signing credentials setup
│   └── info.tsx              # Project info display
├── components/               # Reusable UI components
│   ├── MainMenu.tsx          # Interactive main menu
│   ├── SetupFlow.tsx         # Initial setup wizard
│   ├── DevPropertiesForm.tsx # Dev properties configuration
│   ├── SigningPropertiesForm.tsx # Signing setup form
│   ├── PasswordInput.tsx     # Secure password input
│   ├── TextInput.tsx         # Text input component
│   ├── InfoScreen.tsx        # Project info display
│   ├── StatusIndicator.tsx   # Status/progress indicator
│   └── ProcessOutput.tsx     # Process output display
├── types/                    # TypeScript type definitions
│   └── index.ts              # Shared types
└── utils/                    # Utility modules
    ├── project-detection.ts  # Project validation and paths
    ├── sitevision-api.ts     # Sitevision REST API client
    ├── webpack-runner.ts     # Webpack integration
    ├── zip.ts                # Zip file utilities
    ├── process-runner.ts     # Process spawning
    └── password-prompt.ts    # Password prompting
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev
```

## License

MIT
