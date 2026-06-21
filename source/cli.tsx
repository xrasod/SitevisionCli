#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import {Text, Box} from 'ink';
import meow from 'meow';
import {readFileSync} from 'node:fs';
import App from './app.js';
import {getCommand} from './commands/index.js';
import {
	requireProject,
	migrateLegacyPassword,
} from './utils/project-detection.js';
import {promptYesNo} from './utils/password-prompt.js';
import {checkForUpdate} from './utils/version-check.js';
import {
	isFirstRun,
	markFirstRunComplete,
	getLastSeenVersion,
	setLastSeenVersion,
} from './utils/config.js';
import {WelcomeScreen} from './components/WelcomeScreen.js';
import {printBranding} from './utils/branding.js';

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

const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

// Visible column width of a string: astral code points (emoji) take 2 columns,
// everything else 1. ANSI escapes are never passed in here.
function displayWidth(text: string): number {
	let width = 0;
	for (const char of text) {
		width += (char.codePointAt(0) ?? 0) > 0xffff ? 2 : 1;
	}

	return width;
}

// Print a boxed masthead. Borders are sized from the content's display width so
// they stay aligned regardless of how long the version string is.
function printMasthead(version: string): void {
	const left = '📦  Sitevision CLI';
	const right = `v${version}`;
	const padding = 2; // spaces inside each vertical border
	const gap = 7; // spaces between the title and the version

	const inner =
		padding + displayWidth(left) + gap + displayWidth(right) + padding;
	const border = '─'.repeat(inner);
	const spaces = (n: number) => ' '.repeat(n);

	console.log(`${CYAN}╭${border}╮${RESET}`);
	console.log(
		`${CYAN}│${RESET}${spaces(padding)}${BOLD}${CYAN}${left}${RESET}` +
			`${spaces(gap)}${DIM}${right}${RESET}${spaces(padding)}${CYAN}│${RESET}`,
	);
	console.log(`${CYAN}╰${border}╯${RESET}`);
}

async function main() {
	// On the very first run we show a dedicated welcome screen instead of the
	// masthead, so the branding is the moment. Only when stdin is a TTY — the
	// welcome is interactive and would hang in CI / piped input.
	const firstRun = isFirstRun() && Boolean(process.stdin.isTTY);

	// On a version bump (but not the very first run) show a "what's new" banner
	// with the logo. `lastSeen` is undefined for fresh installs and for users
	// who predate version tracking — in both cases we record the version
	// silently rather than claiming an update happened.
	const lastSeen = getLastSeenVersion();
	const isUpdate =
		!firstRun && lastSeen !== undefined && lastSeen !== pkg.version;

	if (!firstRun) {
		if (isUpdate) {
			printBranding();
			console.log(
				`\x1b[32m\n  ✨ Updated to v${pkg.version}\x1b[0m \x1b[2m(from v${lastSeen})\x1b[0m\n`,
			);
		} else {
			printMasthead(pkg.version);
		}

		// Record the current version so the banner shows once per upgrade.
		setLastSeenVersion(pkg.version);

		// Check npm for a newer published release.
		const latestVersion = await checkForUpdate(pkg.name, pkg.version);
		if (latestVersion) {
			console.log(
				`\x1b[33m  ↑ update available: ${pkg.version} → ${latestVersion}  (run: npm i -g ${pkg.name})\x1b[0m`,
			);
		}
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

	// First run: show the welcome (branding + optional signing-password save),
	// then continue to the normal flow once the user dismisses it.
	if (firstRun) {
		await new Promise<void>(resolve => {
			const app = render(
				<WelcomeScreen
					project={project}
					onComplete={() => {
						markFirstRunComplete();
						setLastSeenVersion(pkg.version);
						app.unmount();
					}}
				/>,
			);
			app.waitUntilExit().then(resolve, resolve);
		});
	}

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
		console.log(
			'\n\x1b[33m⚠ Plaintext password found in .dev_properties.json\x1b[0m',
		);
		const move = await promptYesNo(
			'Move it to the OS keychain and remove it from the file? (y/N): ',
		);
		if (move) {
			if (migrateLegacyPassword(project)) {
				console.log('\x1b[32m✓ Password moved to keychain.\x1b[0m\n');
			} else {
				console.log(
					'\x1b[31mCould not access keychain; leaving the file unchanged.\x1b[0m\n',
				);
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

main().catch(error => {
	console.error('Fatal error:', error);
	process.exit(1);
});
