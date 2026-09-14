import React from 'react';
import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {render} from 'ink-testing-library';
import {
	detectProject,
	getPackageJsonSyncChanges,
	normalizeDomain,
	writeDevProperties,
} from '../source/utils/project-detection.js';
import {ConfigForm, saveConfig} from '../source/shell/ConfigForm.js';

const delay = async (ms: number) =>
	new Promise(resolve => {
		setTimeout(resolve, ms);
	});

function workspaceApp() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-form-'));
	fs.mkdirSync(path.join(root, '.git'));
	fs.writeFileSync(
		path.join(root, '.dev_properties.json'),
		JSON.stringify({
			domain: 'site.example',
			siteName: 'Site',
			username: 'me@example.com',
			authMethod: 'basic',
		}),
	);
	const app = path.join(root, 'webapps', 'one');
	fs.mkdirSync(app, {recursive: true});
	fs.writeFileSync(
		path.join(app, 'manifest.json'),
		JSON.stringify({id: 'one', name: 'One', version: '1.0.0', type: 'WebApp'}),
	);
	fs.writeFileSync(path.join(app, 'package.json'), '{}');
	return app;
}

const formValues = (overrides: Record<string, string> = {}) => ({
	domain: 'site.example',
	siteName: 'Site',
	addonName: '',
	username: 'me@example.com',
	authMethod: 'basic',
	password: '',
	clientId: '',
	authorizationEndpoint: '',
	tokenEndpoint: '',
	scopes: '',
	clientSecret: '',
	sessionLoginUrl: '',
	useHTTPForDevDeploy: 'no',
	signingUsername: '',
	certificateName: '',
	signingPassword: '',
	...overrides,
});

const readJson = (file: string) =>
	JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;

test('in workspace mode saveConfig never creates an app file', t => {
	const app = workspaceApp();
	const root = path.resolve(app, '..', '..');
	saveConfig(
		{...detectProject(app)!, workspaceRoot: root},
		formValues({
			addonName: 'One Addon',
			authMethod: 'cookie',
			signingUsername: 'signer@example.com',
		}),
		new Set(['addonName', 'authMethod', 'signingUsername']),
	);
	t.false(fs.existsSync(path.join(app, '.dev_properties.json')));
	t.is(readJson(path.join(app, 'package.json'))['addonName'], 'One Addon');
	t.deepEqual(readJson(path.join(root, '.dev_properties.json')), {
		domain: 'site.example',
		siteName: 'Site',
		username: 'me@example.com',
		authMethod: 'cookie',
		signingUsername: 'signer@example.com',
	});
});

test('in app mode saveConfig writes the complete file from package.json defaults', t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-appmode-'));
	fs.writeFileSync(
		path.join(dir, 'manifest.json'),
		JSON.stringify({id: 'x', name: 'X', version: '1.0.0', type: 'WebApp'}),
	);
	fs.writeFileSync(
		path.join(dir, 'package.json'),
		JSON.stringify({
			developmentDomain: 'pkg.example',
			siteName: 'Site',
			addonName: 'Addon',
		}),
	);
	const project = detectProject(dir)!;
	t.is(project.devProperties?.domain, 'pkg.example');
	saveConfig(
		project,
		formValues({domain: 'pkg.example', addonName: 'Addon'}),
		new Set(['username']),
	);
	t.deepEqual(readJson(path.join(dir, '.dev_properties.json')), {
		domain: 'pkg.example',
		siteName: 'Site',
		addonName: 'Addon',
		username: 'me@example.com',
		authMethod: 'basic',
		useHTTPForDevDeploy: false,
	});
	// Spelled-out defaults and user values are nothing to sync.
	t.deepEqual(getPackageJsonSyncChanges(dir), []);
});

test('the form marks inherited fields, edits the focused field and saves on Enter', async t => {
	const app = workspaceApp();
	const root = path.resolve(app, '..', '..');
	const project = {...detectProject(app)!, workspaceRoot: root};
	let saved = 0;
	const {stdin, lastFrame} = render(
		<ConfigForm
			project={project}
			active
			width={100}
			height={40}
			pickAddon={async () => null}
			onSaved={() => {
				saved++;
			}}
			onEditingChange={() => {}}
		/>,
	);
	await delay(20);
	const frame = lastFrame() ?? '';
	t.true(frame.includes('↑ root'));
	t.true(frame.includes('✗ required'));

	stdin.write('\t');
	await delay(10);
	stdin.write('\t');
	await delay(10);
	stdin.write('\r');
	await delay(10);
	stdin.write('Booking');
	await delay(20);
	t.true(lastFrame()?.includes('Booking'));
	stdin.write('\r');
	await delay(20);
	t.is(saved, 1);
	t.is(readJson(path.join(app, 'package.json'))['addonName'], 'Booking');
	t.false(fs.existsSync(path.join(app, '.dev_properties.json')));
});

test('arrow keys move the caret so edits land mid-string', async t => {
	const app = workspaceApp();
	const project = detectProject(app)!;
	const {stdin} = render(
		<ConfigForm
			project={project}
			active
			width={100}
			height={40}
			pickAddon={async () => null}
			onSaved={() => {}}
			onEditingChange={() => {}}
		/>,
	);
	const press = async (keys: string) => {
		stdin.write(keys);
		await delay(15);
	};

	await delay(20);
	// Tab to the addon field, open it and type a value with a typo.
	await press('\t');
	await press('\t');
	await press('\r');
	await press('Bokning');
	// Walk the caret back between "B" and "k", then insert the missing "o".
	const left = '\u001B[D';
	for (let i = 0; i < 5; i++) {
		// eslint-disable-next-line no-await-in-loop
		await press(left);
	}
	await press('o');
	// Backspace removes the character before the caret, not the last one typed.
	await press('\u007F');
	await press('o');
	await press('\r');
	await delay(20);
	const file = JSON.parse(
		fs.readFileSync(path.join(app, '.dev_properties.json'), 'utf8'),
	);
	t.is(file.addonName, 'Bookning');
});

test('clearing an app value falls back to the workspace one', t => {
	const app = workspaceApp();
	writeDevProperties(app, {
		...detectProject(app)!.devProperties!,
		domain: 'app.example',
	});
	t.is(detectProject(app)!.devProperties?.domain, 'app.example');

	writeDevProperties(app, {
		...detectProject(app)!.devProperties!,
		domain: '',
	});
	const file = JSON.parse(
		fs.readFileSync(path.join(app, '.dev_properties.json'), 'utf8'),
	);
	t.is(file.domain, undefined);
	t.is(detectProject(app)!.devProperties?.domain, 'site.example');
});

test('saving the workspace target writes the root file and apps inherit it', t => {
	const app = workspaceApp();
	const root = path.resolve(app, '..', '..');
	saveConfig(
		{root, devProperties: {domain: 'site.example'}, workspace: true},
		{
			domain: 'new.example',
			siteName: 'Site',
			addonName: '',
			username: 'me@example.com',
			authMethod: 'oauth2',
			password: '',
			clientId: 'svc',
			authorizationEndpoint: 'https://new.example/auth',
			tokenEndpoint: 'https://new.example/token',
			scopes: '',
			clientSecret: '',
			sessionLoginUrl: '',
			useHTTPForDevDeploy: 'no',
			signingUsername: '',
			certificateName: '',
			signingPassword: '',
		},
		new Set(['domain']),
	);
	const project = detectProject(app)!;
	t.is(project.devProperties?.domain, 'new.example');
	t.is(project.devProperties?.oauth2?.clientId, 'svc');
	t.true(project.inheritedKeys.includes('oauth2'));
});

test('normalizeDomain strips scheme, path and stray whitespace', t => {
	t.is(
		normalizeDomain('https://my-use.sitevision-cloud.se'),
		'my-use.sitevision-cloud.se',
	);
	t.is(normalizeDomain('  HTTP://a.example/sites/x '), 'a.example');
	t.is(normalizeDomain('a.example/'), 'a.example');
	t.is(normalizeDomain('a.example:8080'), 'a.example:8080');
	t.is(normalizeDomain('a.example'), 'a.example');
	t.is(normalizeDomain(''), '');
});

test('a domain typed with a protocol is saved as a bare host', async t => {
	const app = workspaceApp();
	const {stdin, lastFrame} = render(
		<ConfigForm
			project={detectProject(app)!}
			active
			width={100}
			height={40}
			pickAddon={async () => null}
			onSaved={() => {}}
			onEditingChange={() => {}}
		/>,
	);
	await delay(20);
	// The domain row is focused on mount; clear it and retype with a scheme.
	stdin.write('\r');
	await delay(10);
	for (let i = 0; i < 20; i++) {
		stdin.write('\u007f');
		// eslint-disable-next-line no-await-in-loop
		await delay(4);
	}

	stdin.write('https://new.example/sites/x');
	await delay(20);
	stdin.write('\r');
	await delay(30);
	const file = JSON.parse(
		fs.readFileSync(path.join(app, '.dev_properties.json'), 'utf8'),
	);
	t.is(file.domain, 'new.example');
	const frame = lastFrame() ?? '';
	t.true(frame.includes('new.example'));
	// The note explains why what was typed is not what was stored.
	t.true(frame.includes('a domain is a host only'));
	t.false(frame.includes('✗ host only'));
});
