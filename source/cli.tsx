#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import {Text, Box} from 'ink';
import meow from 'meow';
import {readFileSync} from 'node:fs';
import updateNotifier from 'update-notifier';
import App from './app.js';
import {getCommand} from './commands/index.js';
import {requireProject} from './utils/project-detection.js';

// Check for updates
const pkg = JSON.parse(
	readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);
updateNotifier({pkg}).notify();

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
