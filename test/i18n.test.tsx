import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {render} from 'ink-testing-library';
import {t as tr, setLanguage, getLanguage} from '../source/utils/i18n.js';
import {getGlobalSigning, getSettings} from '../source/utils/config.js';
import {localizedText} from '../source/utils/project-detection.js';
import {SettingsScreen} from '../source/shell/Settings.js';
import {actions} from '../source/shell/actions.js';

const delay = async (ms: number) =>
	new Promise(resolve => {
		setTimeout(resolve, ms);
	});

test.serial('t() returns English keys as-is and Swedish from the table', t => {
	setLanguage('en');
	t.is(tr('Overview'), 'Overview');
	t.is(tr('{n} apps', {n: 3}), '3 apps');
	setLanguage('sv');
	t.is(tr('Overview'), 'Översikt');
	t.is(tr('WORKSPACE {n} apps', {n: 3}), 'ARBETSYTA 3 appar');
	t.is(tr('untranslated text'), 'untranslated text');
	t.is(localizedText({sv: 'Namn', en: 'Name'}), 'Namn');
	setLanguage('en');
	t.is(localizedText({sv: 'Namn', en: 'Name'}), 'Name');
});

test.serial(
	'the settings screen switches language and persists it',
	async t => {
		process.env['XDG_CONFIG_HOME'] = fs.mkdtempSync(
			path.join(os.tmpdir(), 'svc-i18n-'),
		);
		setLanguage('en');
		let changed = 0;
		const {stdin, lastFrame} = render(
			<SettingsScreen
				onChanged={() => {
					changed++;
				}}
				onClose={() => {}}
			/>,
		);
		await delay(20);
		t.true(lastFrame()?.includes('Language'));
		stdin.write('\r');
		await delay(10);
		stdin.write('[C');
		await delay(10);
		stdin.write('\r');
		await delay(20);
		t.is(changed, 1);
		t.is(getLanguage(), 'sv');
		t.is(getSettings().language, 'sv');
		t.true(lastFrame()?.includes('Språk'));
		setLanguage('en');
	},
);

test.serial(
	'the settings screen edits the default signing user as text',
	async t => {
		process.env['XDG_CONFIG_HOME'] = fs.mkdtempSync(
			path.join(os.tmpdir(), 'svc-settings-'),
		);
		setLanguage('en');
		const {stdin, lastFrame, unmount} = render(
			<SettingsScreen onChanged={() => {}} onClose={() => {}} />,
		);
		await delay(20);
		t.regex(lastFrame() ?? '', /Default signing user/);
		t.regex(lastFrame() ?? '', /language svc itself speaks/);
		for (let i = 0; i < 4; i++) {
			stdin.write('\u001B[B');
			// eslint-disable-next-line no-await-in-loop
			await delay(10);
		}

		stdin.write('\r');
		await delay(10);
		stdin.write('qme@example.com');
		await delay(10);
		stdin.write('\u007F');
		await delay(10);
		stdin.write('m');
		await delay(10);
		stdin.write('\r');
		await delay(20);
		t.is(getGlobalSigning().signingUsername, 'qme@example.com');
		t.regex(lastFrame() ?? '', /qme@example\.com/);

		stdin.write('\r');
		await delay(10);
		for (const _ of 'qme@example.com') {
			stdin.write('\u007F');
			// eslint-disable-next-line no-await-in-loop
			await delay(5);
		}

		stdin.write('\r');
		await delay(20);
		t.is(getGlobalSigning().signingUsername, undefined);
		unmount();
	},
);

test.serial('every action label has a Swedish translation', t => {
	setLanguage('sv');
	// Command names stay as they are typed: svc dev, svc build, ...
	const commands = new Set(['Dev', 'Watch', 'Build', 'Sign']);
	const untranslated = [...actions.map(action => action.label), 'Navigator']
		.filter(label => !commands.has(label))
		.filter(label => tr(label) === label);
	setLanguage('en');
	t.deepEqual(untranslated, []);
});
