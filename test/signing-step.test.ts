import test from 'ava';
import {decideSigningStep} from '../source/utils/signing-step.js';

test('uses the session password when one is already available', t => {
	t.is(
		decideSigningStep({
			hasSessionPassword: true,
			hasStoredPassword: true,
			isRetry: false,
		}),
		'proceed',
	);
});

test('offers the keychain choice when a password is saved', t => {
	t.is(
		decideSigningStep({
			hasSessionPassword: false,
			hasStoredPassword: true,
			isRetry: false,
		}),
		'choice',
	);
});

test('prompts for input when nothing is saved', t => {
	t.is(
		decideSigningStep({
			hasSessionPassword: false,
			hasStoredPassword: false,
			isRetry: false,
		}),
		'input',
	);
});

test('skips the choice and prompts directly when retrying a failed saved password', t => {
	t.is(
		decideSigningStep({
			hasSessionPassword: false,
			hasStoredPassword: true,
			isRetry: true,
		}),
		'input',
	);
});
