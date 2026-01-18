# Sitevision CLI

A modern TUI (Terminal User Interface) wrapper for Sitevision development tools. Built with [Ink](https://github.com/vadimdemedes/ink) for a beautiful command-line experience.

## Features

- 🎨 **Interactive Menu** - Full-screen TUI with arrow key navigation
- 🚀 **Smart wrapper** - Layers on top of existing sitevision-scripts
- 📦 **Project detection** - Automatically detects Sitevision projects
- ⚡ **Enhanced workflows** - Combined commands like dev with auto-signing
- 🎯 **Live feedback** - Real-time status updates and progress indicators
- ⌨️  **Two modes** - Interactive menu OR direct command execution
- 🔧 **Automatic setup** - Checks and offers to install dependencies and configure dev properties on startup

## Install

```bash
npm install --global @sitevision/cli
```

## Usage

The CLI must be run inside a Sitevision project directory. It wraps the underlying `sitevision-scripts` commands with a better UI.

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

Use arrow keys (↑↓) to navigate and Enter to select a command:
- 🚀 Dev - Start development server
- 🔐 Dev (Signed) - Development with automatic signing
- 🔨 Build - Build for production
- 📦 Deploy - Deploy to dev server
- 🚢 Deploy (Force) - Force deploy
- 🌍 Deploy Production - Deploy to production
- ℹ️  Info - Show project info
- ❌ Exit

### Direct Commands

You can also run commands directly:

#### Development

```bash
# Start development server
svc dev

# Start development server with automatic signing
svc dev --signed
```

#### Building

```bash
# Build the application for production
svc build
```

#### Deployment

```bash
# Deploy to development server
svc deploy

# Force deploy (overwrite existing)
svc deploy --force

# Deploy to production
svc deploy --production
```

#### Project Info

```bash
# Show project information and configuration
svc info
```

## Architecture

This CLI is designed as a layer on top of the existing `sitevision-scripts` commands:

- **Project Detection** - Validates Sitevision project structure
- **Command Routing** - Maps CLI commands to npm scripts
- **Process Management** - Spawns and manages child processes
- **TUI Components** - Rich terminal UI with Ink

### Directory Structure

```
source/
├── cli.tsx                 # Main entry point
├── commands/               # Command implementations
│   ├── types.ts           # Command type definitions
│   ├── dev.tsx            # Development command
│   ├── build.tsx          # Build command
│   ├── deploy.tsx         # Deploy command
│   └── info.tsx           # Info command
├── components/            # Reusable UI components
│   ├── ProcessOutput.tsx  # Process output display
│   └── StatusIndicator.tsx # Status/progress indicator
└── utils/                 # Utility modules
    ├── project-detection.ts # Project validation
    └── process-runner.ts    # Process spawning
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Test
npm test
```

## License

MIT
