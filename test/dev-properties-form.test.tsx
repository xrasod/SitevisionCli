import React from 'react';
import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'ava';
import {render} from 'ink-testing-library';
import {DevPropertiesForm} from '../source/components/DevPropertiesForm.js';

const delay = async (ms: number) =>
	new Promise(resolve => {
		setTimeout(resolve, ms);
	});

// Walk the basic-auth steps: four TextInputs (domain, siteName, addonName,
// username), the authMethod BooleanInput (Enter = basic default), then the
// password TextInput. Leaves the form on the final useHTTP BooleanInput step.
async function fillTextSteps(stdin: {write: (s: string) => void}) {
	for (const value of [
		'test.sitevision.se',
		'MySite',
		'MyAddon',
		'user@example.com',
	]) {
		/* eslint-disable no-await-in-loop -- keystrokes must land sequentially */
		stdin.write(value);
		await delay(15);
		stdin.write('\r');
		await delay(15);
		/* eslint-enable no-await-in-loop -- end sequential keystrokes */
	}

	stdin.write('\r'); // authMethod: Enter keeps basic
	await delay(15);
	stdin.write('\r'); // password: empty
	await delay(15);
}

// Regression: a fresh setup left useHTTPForDevDeploy undefined, so pressing
// Enter on the final "Use HTTP?" step did nothing — the form sat stuck and
// the file was never written. Enter must now submit the default (false).
test('pressing Enter on the final step writes the file with useHTTP=false', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-devprops-'));
	let completed = false;

	const {stdin} = render(
		<DevPropertiesForm
			projectRoot={root}
			packageJson={{}}
			onComplete={() => {
				completed = true;
			}}
			onCancel={() => {}}
		/>,
	);

	await fillTextSteps(stdin);
	stdin.write('\r'); // Enter on the final useHTTP step
	await delay(50);

	const file = path.join(root, '.dev_properties.json');
	t.true(completed, 'onComplete should fire when Enter submits the default');
	t.true(fs.existsSync(file), `expected file at ${file}`);

	const written = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<
		string,
		unknown
	>;
	t.false(written['useHTTPForDevDeploy']);
	t.is(written['domain'], 'test.sitevision.se');
	t.is(written['username'], 'user@example.com');
});

test('answering the final step explicitly writes the file', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-devprops-'));

	const {stdin} = render(
		<DevPropertiesForm
			projectRoot={root}
			packageJson={{}}
			onComplete={() => {}}
			onCancel={() => {}}
		/>,
	);

	await fillTextSteps(stdin);
	stdin.write('y'); // Use HTTP -> yes
	await delay(50);

	const written = JSON.parse(
		fs.readFileSync(path.join(root, '.dev_properties.json'), 'utf8'),
	) as Record<string, unknown>;
	t.true(written['useHTTPForDevDeploy']);
});
