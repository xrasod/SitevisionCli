import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import {
	detectProject,
	migrateLegacyPassword,
	writeDevProperties,
} from '../source/utils/project-detection.js';
import {getDeployPassword} from '../source/utils/keychain.js';

let sites = 0;

// An app whose .dev_properties.json still holds a plaintext password.
function legacyApp() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-legacy-'));
	const domain = `site${sites++}.example`;
	fs.mkdirSync(path.join(dir, '.git'));
	fs.writeFileSync(
		path.join(dir, 'manifest.json'),
		JSON.stringify({id: 'x', version: '1.0.0', type: 'WebApp'}),
	);
	fs.writeFileSync(path.join(dir, 'package.json'), '{}');
	const file = path.join(dir, '.dev_properties.json');
	fs.writeFileSync(
		file,
		JSON.stringify({
			domain,
			siteName: 'Site',
			addonName: 'Addon',
			username: 'me',
			password: 'hunter2',
		}),
	);
	const read = () =>
		JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
	return {dir, domain, file, read};
}

test('migrateLegacyPassword moves the password and leaves the rest', t => {
	const {dir, domain, read} = legacyApp();
	const project = detectProject(dir)!;
	t.true(project.hasLegacyPassword);
	t.true(migrateLegacyPassword(project));
	t.is(getDeployPassword(domain, 'me'), 'hunter2');
	t.deepEqual(read(), {
		domain,
		siteName: 'Site',
		addonName: 'Addon',
		username: 'me',
	});
});

test('migrateLegacyPassword does not claim success while the file keeps the password', t => {
	const {dir, file, read} = legacyApp();
	const project = detectProject(dir)!;
	fs.chmodSync(file, 0o444);
	t.false(migrateLegacyPassword(project));
	t.true(project.hasLegacyPassword);
	t.is(read()['password'], 'hunter2');
});

test('rewriting the file moves a plaintext password to the keychain first', t => {
	const {dir, domain, read} = legacyApp();
	const {devProperties} = detectProject(dir)!;
	writeDevProperties(dir, {...devProperties!, siteName: 'Renamed'});
	t.is(read()['siteName'], 'Renamed');
	t.false('password' in read());
	t.is(getDeployPassword(domain, 'me'), 'hunter2');
});

test.serial(
	'without a keychain, rewriting the file keeps the password in it',
	t => {
		const {dir, read} = legacyApp();
		const {devProperties} = detectProject(dir)!;
		process.env['SVC_NO_KEYCHAIN'] = '1';
		writeDevProperties(dir, {...devProperties!, siteName: 'Renamed'});
		process.env['SVC_NO_KEYCHAIN'] = 'memory';
		t.is(read()['siteName'], 'Renamed');
		t.is(read()['password'], 'hunter2');
	},
);
