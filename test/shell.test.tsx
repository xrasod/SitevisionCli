import React from 'react';
import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {render} from 'ink-testing-library';
import {detectProject} from '../source/utils/project-detection.js';
import {Shell} from '../source/shell/Shell.js';
import {CommandPalette} from '../source/shell/CommandPalette.js';
import {fuzzyMatch, type Action} from '../source/shell/actions.js';

const delay = async (ms: number) =>
	new Promise(resolve => {
		setTimeout(resolve, ms);
	});

function project(name = 'Demo') {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-shell-'));
	fs.writeFileSync(
		path.join(root, 'manifest.json'),
		JSON.stringify({id: 'demo', name, version: '2.1.0', type: 'RESTApp'}),
	);
	fs.writeFileSync(path.join(root, 'package.json'), '{}');
	return detectProject(root)!;
}

test('fuzzyMatch is a case-insensitive subsequence match', t => {
	t.true(fuzzyMatch('dpp', 'Deploy to production'));
	t.true(fuzzyMatch('', 'anything'));
	t.false(fuzzyMatch('xyz', 'Deploy'));
});

test('the shell renders the frame for a single app', t => {
	const {lastFrame} = render(<Shell apps={[project()]} version="9.9.9" />);
	const frame = lastFrame() ?? '';
	t.true(frame.includes('svc'));
	t.true(frame.includes('Demo'));
	t.true(frame.includes('Overview'));
	t.true(frame.includes('Versions'));
	t.true(frame.includes('v9.9.9'));
});

test('typing in the palette filters actions and Enter runs the selection', async t => {
	let ran: Action | undefined;
	const {stdin, lastFrame} = render(
		<CommandPalette
			project={project()}
			height={20}
			onRun={action => {
				ran = action;
			}}
			onClose={() => {}}
		/>,
	);
	await delay(20);
	stdin.write('build');
	await delay(20);
	t.true(lastFrame()?.includes('Build'));
	t.false(lastFrame()?.includes('Watch'));
	t.false(lastFrame()?.includes('Dev'));
	stdin.write('\r');
	await delay(20);
	t.is(ran?.id, 'build');
});
