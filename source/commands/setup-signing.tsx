import fs from 'fs';
import path from 'path';
import readline from 'readline';
import {type Command} from './types.js';

function question(rl: readline.Interface, prompt: string): Promise<string> {
	return new Promise((resolve) => {
		rl.question(prompt, (answer) => {
			resolve(answer);
		});
	});
}

export const setupSigningCommand: Command = {
	name: 'setup-signing',
	description: 'Configure signing credentials for developer.sitevision.se',
	requiresProject: true,
	async execute({project}) {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		console.log('\n\x1b[36m\x1b[1mSetup Signing Credentials\x1b[0m\n');
		console.log('Configure credentials for signing apps on developer.sitevision.se');
		console.log('(Password will be prompted when running signing commands)\n');

		// Find existing dev properties file
		const devPropertiesPaths = [
			path.join(project.root, '.dev_properties.json'),
			path.join(project.root, '.dev-properties.json'),
		];

		let devPropertiesPath: string = devPropertiesPaths[0]!;
		let existingProperties: Record<string, unknown> = {};

		for (const p of devPropertiesPaths) {
			if (fs.existsSync(p)) {
				devPropertiesPath = p;
				try {
					existingProperties = JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
				} catch {
					// Invalid file, start fresh
				}
				break;
			}
		}

		try {
			// Get signing username
			const defaultUsername = (existingProperties['signingUsername'] as string) || '';
			const usernamePrompt = defaultUsername
				? `Signing username [${defaultUsername}]: `
				: 'Signing username: ';
			let signingUsername = await question(rl, usernamePrompt);
			if (!signingUsername && defaultUsername) {
				signingUsername = defaultUsername;
			}

			if (!signingUsername) {
				console.log('\x1b[31mError: Signing username is required\x1b[0m');
				rl.close();
				return;
			}

			// Get certificate name (optional)
			const defaultCertName = (existingProperties['certificateName'] as string) || '';
			const certPrompt = defaultCertName
				? `Certificate name (blank for default) [${defaultCertName}]: `
				: 'Certificate name (blank for default): ';
			let certificateName = await question(rl, certPrompt);
			if (!certificateName && defaultCertName) {
				certificateName = defaultCertName;
			}

			rl.close();

			// Update dev properties (remove any stored password from old config)
			const {signingPassword: _removed, ...cleanedProperties} = existingProperties as Record<string, unknown> & {signingPassword?: unknown};
			const updatedProperties = {
				...cleanedProperties,
				signingUsername,
				...(certificateName && {certificateName}),
			};

			fs.writeFileSync(devPropertiesPath, JSON.stringify(updatedProperties, null, 2));

			console.log(`\n\x1b[32mSigning credentials saved to ${path.basename(devPropertiesPath)}\x1b[0m\n`);
		} catch (error) {
			rl.close();
			console.error('\x1b[31mError setting up signing credentials:\x1b[0m', error);
		}
	},
};
