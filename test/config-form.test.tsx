import React from 'react';
import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {render} from 'ink-testing-library';
import {
	detectProject,
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

test('saveConfig writes only local values and leaves untouched secrets alone', t => {
	const app = workspaceApp();
	const project = detectProject(app)!;
	saveConfig(
		project,
		{
			domain: 'site.example',
			siteName: 'Site',
			addonName: 'One Addon',
			username: 'me@example.com',
			authMethod: 'cookie',
			password: '',
			clientId: '',
			authorizationEndpoint: '',
			tokenEndpoint: '',
			scopes: '',
			clientSecret: '',
			sessionLoginUrl: '',
			useHTTPForDevDeploy: 'no',
			signingUsername: 'signer@example.com',
			certificateName: '',
			signingPassword: '',
		},
		new Set(['addonName', 'authMethod', 'signingUsername']),
	);
	const file = JSON.parse(
		fs.readFileSync(path.join(app, '.dev_properties.json'), 'utf8'),
	);
	t.deepEqual(file, {
		addonName: 'One Addon',
		authMethod: 'cookie',
		useHTTPForDevDeploy: false,
		signingUsername: 'signer@example.com',
	});
});

test('the form marks inherited fields, edits the focused field and saves on Enter', async t => {
	const app = workspaceApp();
	const project = detectProject(app)!;
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
	const file = JSON.parse(
		fs.readFileSync(path.join(app, '.dev_properties.json'), 'utf8'),
	);
	t.is(file.addonName, 'Booking');
	t.is(file.domain, undefined);
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
