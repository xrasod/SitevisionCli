import fs from 'fs';
import path from 'path';
import readline from 'readline';
import {type Command} from './types.js';
import {findDevPropertiesPath} from '../utils/project-detection.js';
import {
	configProblem,
	getGlobalSigning,
	setGlobalSigning,
	settingsFile,
} from '../utils/config.js';

// rl.question drops lines that arrive before it is called, which is every line
// but the first when stdin is piped. The iterator buffers them.
function lineReader(rl: readline.Interface) {
	const lines = rl[Symbol.asyncIterator]();
	return async (prompt: string): Promise<string> => {
		process.stdout.write(prompt);
		const {value, done} = await lines.next();
		return done ? '' : String(value);
	};
}

export const setupSigningCommand: Command = {
	name: 'setup-signing',
	description: 'Configure signing credentials for developer.sitevision.se',
	requiresProject: true,
	async execute({project, flags}) {
		const global = Boolean(flags['global']);
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		const question = lineReader(rl);

		console.log('\n\x1b[36m\x1b[1mSetup Signing Credentials\x1b[0m\n');
		console.log(
			'Configure credentials for signing apps on developer.sitevision.se',
		);
		console.log('(Password will be prompted when running signing commands)\n');

		const devPropertiesPath =
			findDevPropertiesPath(project.root) ??
			path.join(project.root, '.dev_properties.json');
		let existingProperties: Record<string, unknown> = {};
		if (global) {
			existingProperties = {...getGlobalSigning()};
		} else {
			try {
				existingProperties = JSON.parse(
					fs.readFileSync(devPropertiesPath, 'utf8'),
				) as Record<string, unknown>;
			} catch {
				// Missing or invalid file, start fresh
			}
		}

		try {
			// Get signing username
			const defaultUsername =
				(existingProperties['signingUsername'] as string) || '';
			const usernamePrompt = defaultUsername
				? `Signing username [${defaultUsername}]: `
				: 'Signing username: ';
			let signingUsername = await question(usernamePrompt);
			if (!signingUsername && defaultUsername) {
				signingUsername = defaultUsername;
			}

			if (!signingUsername) {
				console.log('\x1b[31mError: Signing username is required\x1b[0m');
				rl.close();
				process.exitCode = 1;
				return;
			}

			// Get certificate name (optional)
			const defaultCertName =
				(existingProperties['certificateName'] as string) || '';
			const certPrompt = defaultCertName
				? `Certificate name (blank for default) [${defaultCertName}]: `
				: 'Certificate name (blank for default): ';
			let certificateName = await question(certPrompt);
			if (!certificateName && defaultCertName) {
				certificateName = defaultCertName;
			}

			rl.close();

			if (global) {
				if (configProblem()) {
					console.log(
						`\x1b[31mError: ${settingsFile()} does not parse; fix it first\x1b[0m`,
					);
					process.exitCode = 1;
					return;
				}

				setGlobalSigning({
					signingUsername,
					...(certificateName && {certificateName}),
				});
				console.log(
					`\n\x1b[32mSigning credentials saved to ${settingsFile()}\x1b[0m\n`,
				);
				return;
			}

			const updatedProperties = {
				...existingProperties,
				signingUsername,
				...(certificateName && {certificateName}),
			};

			fs.writeFileSync(
				devPropertiesPath,
				JSON.stringify(updatedProperties, null, 2),
			);

			console.log(
				`\n\x1b[32mSigning credentials saved to ${path.basename(devPropertiesPath)}\x1b[0m\n`,
			);
		} catch (error) {
			rl.close();
			console.error(
				'\x1b[31mError setting up signing credentials:\x1b[0m',
				error,
			);
			process.exitCode = 1;
		}
	},
};
