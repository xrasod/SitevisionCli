export type SigningStep = 'proceed' | 'choice' | 'input';

/**
 * Decide what to do when a signing password is needed.
 *
 * - `proceed`: a password is already available this session — use it.
 * - `choice`: a password is saved in the keychain — ask whether to use it or
 * enter a new one.
 * - `input`: prompt for a password (nothing saved, or a saved one just failed
 * and we're retrying).
 */
export function decideSigningStep(options: {
	hasSessionPassword: boolean;
	hasStoredPassword: boolean;
	isRetry: boolean;
}): SigningStep {
	if (options.hasSessionPassword) return 'proceed';
	if (options.hasStoredPassword && !options.isRetry) return 'choice';
	return 'input';
}
