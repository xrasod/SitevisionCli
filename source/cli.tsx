#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import {Text, Box} from 'ink';
import meow from 'meow';
import {readFileSync} from 'node:fs';
import App from './app.js';
import {getCommand} from './commands/index.js';
import {requireProject, migrateLegacyPassword} from './utils/project-detection.js';
import {promptYesNo} from './utils/password-prompt.js';
import {checkForUpdate} from './utils/version-check.js';

const pkg = JSON.parse(
	readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const cli = meow(
	`
	Usage
	  $ svc                    Start interactive menu
	  $ svc <command> [options]

	Commands
	  dev           Start development server with watch mode
	  build         Build the application for production
	  deploy        Deploy the application
	  info          Show project information

	Options
	  --help        Show this help message
	  --version     Show version number

	Examples
	  $ svc                     # Interactive menu
	  $ svc dev
	  $ svc dev --signed
	  $ svc build
	  $ svc deploy --force
	  $ svc deploy --production
	  $ svc info
`,
	{
		importMeta: import.meta,
		flags: {
			signed: {
				type: 'boolean',
				default: false,
			},
			force: {
				type: 'boolean',
				alias: 'f',
				default: false,
			},
			production: {
				type: 'boolean',
				alias: 'p',
				default: false,
			},
		},
	},
);

const [commandName, ...args] = cli.input;

async function main() {
	// Show the CLI version on startup, and check npm for a newer release.
	console.log(`\x1b[36msvc v${pkg.version}\x1b[0m`);
	const latestVersion = await checkForUpdate(pkg.name, pkg.version);
	if (latestVersion) {
		console.log(
			`\x1b[33m  ↑ update available: ${pkg.version} → ${latestVersion}  (run: npm i -g ${pkg.name})\x1b[0m`,
		);
	}

	// Check if we're in a Sitevision project
	const project = (() => {
		try {
			return requireProject();
		} catch (error) {
			render(
				<Box flexDirection="column" padding={1}>
					<Text color="red">Error: {(error as Error).message}</Text>
					<Text dimColor>
						Make sure you're in a Sitevision project directory
					</Text>
				</Box>,
			);
			process.exit(1);
		}
	})();

	// If no command, show interactive menu
	if (!commandName) {
		render(<App project={project} />);
		return;
	}

	// Get the command
	const command = getCommand(commandName);

	if (!command) {
		render(
			<Box flexDirection="column" padding={1}>
				<Text color="red">Unknown command: {commandName}</Text>
				<Text>
					Run <Text bold>svc --help</Text> to see available commands
				</Text>
			</Box>,
		);
		process.exit(1);
	}

	// Offer to migrate a legacy plaintext password into the OS keychain.
	// Interactive `svc` handles this in SetupFlow; this covers direct commands
	// (svc deploy/dev/sign/…). Skip on non-TTY stdin (e.g. CI) where prompting
	// would fail — the plaintext password is still used for this run.
	if (project.hasLegacyPassword && process.stdin.isTTY) {
		console.log('\n\x1b[33m⚠ Plaintext password found in .dev_properties.json\x1b[0m');
		const move = await promptYesNo('Move it to the OS keychain and remove it from the file? (y/N): ');
		if (move) {
			if (migrateLegacyPassword(project)) {
				console.log('\x1b[32m✓ Password moved to keychain.\x1b[0m\n');
			} else {
				console.log('\x1b[31mCould not access keychain; leaving the file unchanged.\x1b[0m\n');
			}
		}
	}

	// Execute the command
	await command.execute({
		project,
		flags: cli.flags,
		args,
	});
}

main().catch((error) => {
	console.error('Fatal error:', error);
	process.exit(1);
});
