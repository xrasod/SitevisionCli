import {getSigningPassword, setSigningPassword} from './keychain.js';
import {promptPassword, promptYesNo} from './password-prompt.js';

const SIGNING_PROMPT = 'Signing password (developer.sitevision.se): ';

/**
 * Resolve the signing password for the given user.
 *
 * Priority:
 * 1. `SITEVISION_SIGNING_PASSWORD` env var (non-interactive override, no prompts).
 * 2. A password saved in the OS keychain — the user is asked whether to use it
 * or set a new one. Choosing "new" optionally updates the saved password.
 * 3. An interactive prompt — optionally saved to the keychain.
 *
 * Returns an empty string if no password could be obtained.
 */
export async function resolveSigningPassword(
	signingUsername: string,
): Promise<string> {
	const envPassword = process.env['SITEVISION_SIGNING_PASSWORD'];
	if (envPassword) return envPassword;

	const stored = getSigningPassword(signingUsername);

	if (stored) {
		const useStored = await promptYesNo(
			'Use saved signing password from keychain? (Y/n): ',
			true,
		);
		if (useStored) return stored;
	}

	console.log('');
	const password = await promptPassword(SIGNING_PROMPT);
	if (!password) return '';

	const remember = await promptYesNo(
		stored
			? 'Update saved password in OS keychain? (y/N): '
			: 'Save password to OS keychain? (y/N): ',
	);
	if (remember) {
		setSigningPassword(signingUsername, password);
	}

	return password;
}
