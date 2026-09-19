import test from 'ava';
import {
	deleteDeployPassword,
	getDeployPassword,
	setDeployPassword,
	getSigningPassword,
	onKeychainSaveFailed,
} from '../source/utils/keychain.js';

test.serial('SVC_NO_KEYCHAIN=memory keeps secrets in this process only', t => {
	t.is(process.env['SVC_NO_KEYCHAIN'], 'memory');
	t.is(getDeployPassword('site.example', 'me'), null);
	t.true(setDeployPassword('site.example', 'me', 'pw'));
	t.is(getDeployPassword('site.example', 'me'), 'pw');
	deleteDeployPassword('site.example', 'me');
	t.is(getDeployPassword('site.example', 'me'), null);
});

test.serial('any other SVC_NO_KEYCHAIN value turns the keychain off', t => {
	process.env['SVC_NO_KEYCHAIN'] = '1';
	t.false(setDeployPassword('site.example', 'me', 'pw'));
	t.is(getDeployPassword('site.example', 'me'), null);
	t.is(getSigningPassword('signer'), null);
	process.env['SVC_NO_KEYCHAIN'] = 'memory';
});

test.serial('a save that fails is reported, a save that works is not', t => {
	const reports: string[] = [];
	onKeychainSaveFailed(() => {
		reports.push('failed');
	});
	t.true(setDeployPassword('site.example', 'me', 'pw'));
	t.deepEqual(reports, []);

	process.env['SVC_NO_KEYCHAIN'] = '1';
	t.false(setDeployPassword('site.example', 'me', 'pw'));
	// Nothing to save is not a failure.
	t.false(setDeployPassword('site.example', 'me', ''));
	process.env['SVC_NO_KEYCHAIN'] = 'memory';
	t.deepEqual(reports, ['failed']);
});
