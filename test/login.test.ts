import test from 'ava';
import {loginResultMessage} from '../source/commands/login.js';

test('a stored login is reported as saved', t => {
	const message = loginResultMessage('site.example', 'cookie', true);
	t.regex(message, /saved in the OS keychain/);
	t.notRegex(message, /would not store/);
});

test('a login the keychain refused does not claim to be saved', t => {
	// The browser flows store the credential themselves and swallow the
	// result, so claiming success here would send the user away believing
	// they are logged in for next time.
	const message = loginResultMessage('site.example', 'cookie', false);
	t.regex(message, /would not store/);
	t.notRegex(message, /saved in the OS keychain/);
	t.regex(message, /SITEVISION_SESSION_COOKIE/);
});

test('the fallback variable matches the method', t => {
	t.regex(
		loginResultMessage('site.example', 'oauth2', false),
		/SITEVISION_ACCESS_TOKEN/,
	);
});
