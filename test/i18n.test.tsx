import React from 'react';
import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {render} from 'ink-testing-library';
import {t as tr, setLanguage, getLanguage} from '../source/utils/i18n.js';
import {getSettings} from '../source/utils/config.js';
import {localizedText} from '../source/utils/project-detection.js';
import {SettingsScreen} from '../source/shell/Settings.js';

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
