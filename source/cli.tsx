#!/usr/bin/env node
import {render} from 'ink';
import {Text, Box} from 'ink';
import meow from 'meow';
import {readFileSync} from 'node:fs';
import os from 'node:os';
import {runningTasks} from './utils/tasks.js';
import {killAllChildren} from './utils/process-runner.js';
import {Shell} from './shell/Shell.js';
import {getCommand} from './commands/index.js';
import {
	requireProject,
	detectProject,
	migrateLegacyPassword,
	type ProjectInfo,
} from './utils/project-detection.js';
import {discoverApps} from './utils/workspace.js';
import {promptYesNo} from './utils/password-prompt.js';
import {checkForUpdate} from './utils/version-check.js';
import {
	isFirstRun,
	markFirstRunComplete,
	getLastSeenVersion,
	setLastSeenVersion,
	getSettings,
} from './utils/config.js';
import {setLanguage} from './utils/i18n.js';
import {WelcomeScreen} from './components/WelcomeScreen.js';
import {AnimatedLogo} from './components/AnimatedLogo.js';
import {
	printBranding,
	BIG_LOGO,
	BIG_LOGO_WIDTH,
	SMALL_LOGO,
	SMALL_LOGO_WIDTH,
} from './utils/branding.js';

const pkg = JSON.parse(
	readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const cli = meow(
	`
	Usage
	  $ svc                    Open the interactive shell (app or workspace)
	  $ svc <command> [options]

	Commands
	  dev           Start development server with watch mode
	  watch         Watch and rebuild (optionally signing) without deploying
	  build         Build the application for production
	  sign          Sign the app for production deployment
	  deploy        Deploy the application
	  info          Show project information
	  setup-signing Store the signing username and certificate

	Options
	  --signed, -s      dev/watch: sign after each build
	  --force, -f       deploy: overwrite the existing addon version
	  --production, -p  deploy: upload the signed zip to production
	  --activate, -a    deploy: activate after a production deploy
	  --no-zip          build: skip the zip archive
	  --minimal         Shell: compact layout for small terminals
	  --help            Show this help message
	  --version         Show version number

	Credentials for CI come from the environment: SITEVISION_DEPLOY_PASSWORD,
	SITEVISION_ACCESS_TOKEN or SITEVISION_SESSION_COOKIE.

	Examples
	  $ svc                     # Shell: run inside an app, or at the repo root
	  $ svc --minimal           # Shell without the sidebar, for a small pane
	  $ svc dev
	  $ svc dev --signed
	  $ svc watch
	  $ svc watch --signed
	  $ svc build
	  $ svc deploy --force
	  $ svc deploy --production
	  $ svc info
`,
	{
		importMeta: import.meta,
		allowUnknownFlags: false,
		flags: {
			signed: {
				type: 'boolean',
				shortFlag: 's',
				default: false,
			},
			zip: {
				type: 'boolean',
				default: true,
			},
			activate: {
				type: 'boolean',
				shortFlag: 'a',
				default: false,
			},
			force: {
				type: 'boolean',
				shortFlag: 'f',
				default: false,
			},
			production: {
				type: 'boolean',
				shortFlag: 'p',
				default: false,
			},
			minimal: {
				type: 'boolean',
				default: false,
			},
		},
	},
);

const [commandName, ...args] = cli.input;
const settings = getSettings();
setLanguage(settings.language);

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

/**
 * Stop every running task and kill leftover child processes. In raw mode Ink
 * reads Ctrl+C as a keypress, so no SIGINT reaches anything else. Exits when
 * there was work to stop (or on a signal); otherwise the process ends on its
 * own, so a command's last output is never cut off.
 */
function shutdown(code?: number): void {
	const busy = runningTasks();
	for (const task of busy) task.stop();
	const killed = killAllChildren();
	if (busy.length > 0 || killed > 0 || code !== undefined) process.exit(code);
}

function fail(message: string, hint: string): never {
	render(
		<Box flexDirection="column" padding={1}>
			<Text color="red">Error: {message}</Text>
			<Text dimColor>{hint}</Text>
		</Box>,
	);
	process.exit(1);
}

// Pick the widest wordmark that fits the terminal, or undefined if even the
// compact one would wrap.
function pickIntroArt(columns: number): string[] | undefined {
	if (columns >= BIG_LOGO_WIDTH) return BIG_LOGO;
	if (columns >= SMALL_LOGO_WIDTH) return SMALL_LOGO;
	return undefined;
}

// Play the one-shot animated wordmark and resolve once it finishes.
async function playIntro(art: string[]): Promise<void> {
	await new Promise<void>(resolve => {
		const app = render(<AnimatedLogo art={art} onDone={() => app.unmount()} />);
		app.waitUntilExit().then(
			() => resolve(),
			() => resolve(),
		);
	});
}

// Run the full-screen shell on the alternate screen buffer so the scrollback
// is untouched, and restore it on exit. The animated wordmark plays first,
// inside the same buffer, when the terminal is wide enough for it.
async function runShell(
	apps: ProjectInfo[],
	workspaceRoot?: string,
	updatedFrom?: string,
	skipped: string[] = [],
) {
	process.stdout.write('\x1b[?1049h\x1b[H');
	// Also leave the alternate screen when a signal exits past the finally.
	process.once('exit', () => process.stdout.write('\x1b[?1049l'));
	// A crash outside React would print into the alternate screen and vanish
	// with it: leave it first, then report.
	const crash = (error: unknown) => {
		process.stdout.write('\x1b[?1049l');
		console.error('svc crashed:', error);
		shutdown(1);
	};

	process.once('uncaughtException', crash);
	process.once('unhandledRejection', crash);
	try {
		const art =
			process.stdin.isTTY && settings.introAnimation && !cli.flags.minimal
				? pickIntroArt(process.stdout.columns ?? 0)
				: undefined;
		if (art) {
			await playIntro(art);
			process.stdout.write('\x1b[2J\x1b[H');
		}

		// A handover unmounts the shell, runs its job on the normal screen with
		// the terminal to itself, and starts the shell again.
		for (;;) {
			let job: (() => Promise<void>) | undefined;
			const app = render(
				<Shell
					apps={apps}
					workspaceRoot={workspaceRoot}
					version={pkg.version}
					minimal={cli.flags.minimal}
					updatedFrom={updatedFrom}
					skipped={skipped}
					handover={next => {
						job = next;
						app.unmount();
					}}
				/>,
			);
			// eslint-disable-next-line no-await-in-loop
			await app.waitUntilExit();
			if (!job) break;
			process.stdout.write('\x1b[?1049l');
			// eslint-disable-next-line no-await-in-loop
			await job();
			if (workspaceRoot) {
				skipped = [];
				apps = discoverApps(workspaceRoot, skipped);
			}

			updatedFrom = undefined;
			process.stdout.write('\x1b[?1049h\x1b[2J\x1b[H');
		}
	} finally {
		process.stdout.write('\x1b[?1049l');
	}
}

async function main() {
	for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
		process.on(signal, () => {
			shutdown(128 + os.constants.signals[signal]);
		});
	}

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
		// The shell shows the changelog itself; only direct commands get a banner.
		if (isUpdate && commandName) {
			printBranding();
			console.log(
				`\x1b[32m\n  ✨ Updated to v${pkg.version}\x1b[0m \x1b[2m(from v${lastSeen})\x1b[0m\n`,
			);
		} else if (commandName) {
			printMasthead(pkg.version);
		}

		// Record the current version so the banner shows once per upgrade.
		setLastSeenVersion(pkg.version);

		// Check npm for a newer published release.
		const latestVersion =
			process.stdout.isTTY && !process.env['CI']
				? await checkForUpdate(pkg.name, pkg.version)
				: null;
		if (latestVersion) {
			console.log(
				`\x1b[33m  ↑ update available: ${pkg.version} → ${latestVersion}  (run: npm i -g ${pkg.name})\x1b[0m`,
			);
		}
	}

	// No command: the shell. Inside an app it is single-app mode; anywhere
	// above one or more apps it is workspace mode.
	if (!commandName) {
		let project: ProjectInfo | null = null;
		try {
			project = detectProject();
		} catch (error) {
			fail((error as Error).message, 'Fix the manifest and try again');
		}

		if (!project) {
			const skipped: string[] = [];
			const apps = discoverApps(process.cwd(), skipped);
			if (apps.length === 0) {
				fail(
					'No Sitevision apps found here.',
					skipped[0] ??
						'Run svc inside an app directory (manifest.json) or at the root of a repo that contains apps.',
				);
			}

			await runShell(
				apps,
				process.cwd(),
				isUpdate ? lastSeen : undefined,
				skipped,
			);
			shutdown();
			return;
		}

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
				app.waitUntilExit().then(
					() => resolve(),
					() => resolve(),
				);
			});
		}

		await runShell([project], undefined, isUpdate ? lastSeen : undefined);
		shutdown();
		return;
	}

	// Check if we're in a Sitevision project
	const project = (() => {
		try {
			return requireProject();
		} catch (error) {
			return fail(
				(error as Error).message,
				"Make sure you're in a Sitevision project directory",
			);
		}
	})();

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
	// Skip on non-TTY stdin (e.g. CI) where prompting would fail — the
	// plaintext password is still used for this run.
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
	shutdown();
}

main().catch(error => {
	console.error('Fatal error:', error);
	process.exit(1);
});
