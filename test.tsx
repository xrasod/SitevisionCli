import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createElement} from 'react';
import test from 'ava';
import {render} from 'ink-testing-library';
import {WelcomeScreen} from './source/components/WelcomeScreen.js';
import {AnimatedLogo} from './source/components/AnimatedLogo.js';
import {AUTHOR} from './source/utils/branding.js';
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
	// "a tool by" and the author name render as separate <Text> spans, so Ink
	// inserts ANSI style codes between them whenever colour is enabled — assert
	// each piece on its own rather than as one phrase. AUTHOR comes from the
	// source of truth so the "ö" can't drift to a different Unicode
	// normalisation (NFC vs NFD) than a hand-typed literal would.
	t.true(frame.includes('a tool by'));
	t.true(frame.includes(AUTHOR));
	t.regex(frame, /Welcome to Sitevision CLI/);
});

test('animated startup logo credits the author', t => {
	const {lastFrame} = render(
		createElement(AnimatedLogo, {onDone: () => undefined}),
	);
	const frame = lastFrame() ?? '';
	t.true(frame.includes('a tool by'));
	t.true(frame.includes(AUTHOR));
});
