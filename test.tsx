import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createElement} from 'react';
import test from 'ava';
import {render} from 'ink-testing-library';
import {WelcomeScreen} from './source/components/WelcomeScreen.js';
import {isFirstRun, markFirstRunComplete} from './source/utils/config.js';
import type {ProjectInfo} from './source/types/index.js';

test('first-run flag round-trips through the global config', t => {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-test-'));
	process.env['XDG_CONFIG_HOME'] = dir;
	try {
		t.true(isFirstRun());
		markFirstRunComplete();
		t.false(isFirstRun());
	} finally {
		fs.rmSync(dir, {recursive: true, force: true});
	}
});

test('welcome screen renders the branding', t => {
	// No signing username configured, so the keychain is never touched.
	const project = {devProperties: {}} as unknown as ProjectInfo;
	const {lastFrame} = render(
		createElement(WelcomeScreen, {project, onComplete: () => undefined}),
	);
	const frame = lastFrame() ?? '';
	t.regex(frame, /a tool by Rasmus Söderström/);
	t.regex(frame, /Welcome to Sitevision CLI/);
});
