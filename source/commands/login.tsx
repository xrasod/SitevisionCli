import {useState} from 'react';
import {render, Box, Text} from 'ink';
import {type Command} from './types.js';
import {useFinish} from './use-finish.js';
import {AuthLoginScreen} from '../components/AuthLoginScreen.js';
import {promptPassword, promptYesNo} from '../utils/password-prompt.js';
import {setDeployPassword} from '../utils/keychain.js';
import {baseEnvironment} from '../utils/environments.js';
import {say} from '../utils/debug.js';
import type {DevProperties} from '../types/index.js';

const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

/** The browser login for `oauth2` and `cookie`, as a standalone command. */
function LoginScreen({
	dev,
	method,
}: {
	dev: DevProperties;
	method: 'oauth2' | 'cookie';
}) {
	const [result, setResult] = useState<'success' | 'error'>();
	const [message, setMessage] = useState('');
	useFinish(result);

	if (result) {
		return (
			<Box padding={1}>
				<Text color={result === 'success' ? 'green' : 'red'}>{message}</Text>
			</Box>
		);
	}

	return (
		<AuthLoginScreen
			method={method}
			devProperties={dev}
			onComplete={() => {
				setMessage(
					`✓ Logged in to ${dev.domain} as ${method}. The login is saved in the OS keychain.`,
				);
				setResult('success');
			}}
			onError={error => {
				setMessage(error);
				setResult('error');
			}}
			onCancel={() => {
				setMessage('Cancelled.');
				setResult('error');
			}}
		/>
	);
}

export const loginCommand: Command = {
	name: 'login',
	description: 'Log in to a site and save the credential',
	// The login belongs to the site, so this also runs at a workspace root.
	requiresProject: false,
	supportsEnvironment: true,
	async execute({project}) {
		const dev = project.devProperties;
		if (!dev?.domain) {
			say(`\n${YELLOW}Deploy config is missing "domain".${RESET}\n`);
			process.exitCode = 1;
			return;
		}

		const method = dev.authMethod ?? 'basic';
		const where = `${dev.domain} (${dev.environmentName ?? baseEnvironment(dev)})`;

		// The keychain keys a password and a session cookie by username, and
		// stores neither without one. Only oauth2, keyed by client id, can do
		// without.
		if (method !== 'oauth2' && !dev.username) {
			say(
				`\n${YELLOW}Deploy config is missing "username", which ${method} needs to store the login.${RESET}\n`,
			);
			process.exitCode = 1;
			return;
		}

		if (method === 'basic') {
			if (!process.stdin.isTTY) {
				say(
					`\n${YELLOW}No terminal to ask for a password. Set SITEVISION_DEPLOY_PASSWORD instead.${RESET}\n`,
				);
				process.exitCode = 1;
				return;
			}

			say(`${DIM}Basic authentication for ${where}.${RESET}`);
			const password = await promptPassword(
				`Password for ${dev.username}@${dev.domain}: `,
			);
			if (!password) {
				say(`${YELLOW}No password given.${RESET}`);
				process.exitCode = 1;
				return;
			}

			if (await promptYesNo('Save it to the OS keychain? (Y/n): ', true)) {
				setDeployPassword(dev.domain, dev.username, password);
				say(`${GREEN}✓ Saved for ${dev.username}@${dev.domain}.${RESET}`);
			} else {
				say(
					`${DIM}Not saved. Pass it as SITEVISION_DEPLOY_PASSWORD for one run.${RESET}`,
				);
			}

			return;
		}

		if (!process.stdin.isTTY) {
			say(
				`\n${YELLOW}A ${method} login needs a terminal and a browser. Set ${method === 'oauth2' ? 'SITEVISION_ACCESS_TOKEN' : 'SITEVISION_SESSION_COOKIE'} instead.${RESET}\n`,
			);
			process.exitCode = 1;
			return;
		}

		say(`${DIM}Logging in to ${where} with ${method}.${RESET}`);
		await render(<LoginScreen dev={dev} method={method} />).waitUntilExit();
	},
};
