import React from 'react';
import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {render} from 'ink-testing-library';
import {Box} from 'ink';
import {detectProject} from '../source/utils/project-detection.js';
import {Shell} from '../source/shell/Shell.js';
import {CommandPalette} from '../source/shell/CommandPalette.js';
import {Log, Overview} from '../source/shell/Tabs.js';
import type {Task} from '../source/utils/tasks.js';
import {fuzzyMatch, type Action} from '../source/shell/actions.js';
import {navMatches, navMove, NavigatorStrip} from '../source/shell/Frame.js';
import {ChangelogPanel} from '../source/shell/Changelog.js';

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

test('the navigator filter matches app names and the ring wraps', t => {
	const apps = [project('Alpha'), project('Beta'), project('Gamma')];
	t.deepEqual(navMatches(apps, ''), [0, 1, 2]);
	t.deepEqual(navMatches(apps, 'ga'), [2]);
	t.deepEqual(navMatches(apps, 'zzz'), []);

	// Workspace mode appends the settings row (index apps.length) to the ring.
	const ring = [...navMatches(apps, ''), 3];
	t.is(navMove(ring, 0, -1), 3);
	t.is(navMove(ring, 3, 1), 0);
	t.is(navMove(ring, 1, 1), 2);
	// Selection outside the filtered ring lands on the first match.
	t.is(navMove([2, 3], 0, 1), 2);
	t.is(navMove([], 1, 1), 1);
});

function workspace(names: string[]) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-ws-'));
	fs.writeFileSync(
		path.join(root, '.dev_properties.json'),
		JSON.stringify({
			domain: 'example.sitevision.se',
			siteName: 'Site',
			username: 'user',
			password: 'x',
		}),
	);
	const apps = names.map(name => {
		const appRoot = path.join(root, name.toLowerCase());
		fs.mkdirSync(appRoot);
		fs.writeFileSync(
			path.join(appRoot, 'manifest.json'),
			JSON.stringify({
				id: name.toLowerCase(),
				name,
				version: '1.0.0',
				type: 'RESTApp',
			}),
		);
		fs.writeFileSync(path.join(appRoot, 'package.json'), '{}');
		return detectProject(appRoot)!;
	});
	return {root, apps};
}

test('typing in the navigator filters instead of firing shortcuts', async t => {
	const {root, apps} = workspace(['Alpha', 'Beta']);
	const {stdin, lastFrame} = render(
		<Shell apps={apps} workspaceRoot={root} version="9.9.9" />,
	);
	await delay(20);
	t.true(lastFrame()?.includes('Alpha'));

	// "b" would be the build shortcut in the content pane; here it searches.
	stdin.write('b');
	await delay(20);
	const filtered = lastFrame() ?? '';
	t.true(filtered.includes('Beta'));
	t.false(filtered.includes('Alpha'));
	t.true(filtered.includes('1 match'));
	t.false(filtered.toLowerCase().includes('building'));

	// Enter selects and clears the query; the tab bar takes the focus.
	stdin.write('\r');
	await delay(20);
	t.true(lastFrame()?.includes('Alpha'));
});

test('Tab moves between config fields without leaving the content pane', async t => {
	const {root, apps} = workspace(['Alpha', 'Beta']);
	const {stdin, lastFrame} = render(
		<Shell apps={apps} workspaceRoot={root} version="9.9.9" />,
	);
	await delay(20);
	stdin.write('\r');
	await delay(20);
	stdin.write('2');
	await delay(20);
	t.true(lastFrame()?.includes('pick addon'));

	stdin.write('\t');
	await delay(20);
	const frame = lastFrame() ?? '';
	t.true(frame.includes('pick addon'));
	t.false(frame.includes('a–z'));
});

test('wrapped log lines fit the pane and keep the newest line visible', t => {
	const long = `${'x'.repeat(30)} ${'y'.repeat(30)} ${'z'.repeat(30)}`;
	const line = (text: string) => ({
		time: Date.now(),
		tag: 'out',
		level: 'info',
		text,
	});
	const task = {
		id: '1',
		status: 'running',
		label: 'Build',
		appName: 'Demo',
		phase: 'building',
		startedAt: Date.now(),
		lines: [...Array.from({length: 6}, () => line(long)), line('LAST LINE')],
	} as unknown as Task;
	const pane = (wrap: boolean, shown = task) => (
		<Box
			width={40}
			height={8}
			flexDirection="column"
			overflow="hidden"
			alignItems="flex-start"
		>
			<Log wrap={wrap} task={shown} height={8} scroll={0} />
		</Box>
	);
	const short = render(
		pane(true, {...task, lines: [line('ONLY LINE')]} as unknown as Task),
	);
	t.true((short.lastFrame() ?? '').split('\n')[1]?.includes('ONLY LINE'));
	short.unmount();

	// Toggle like pressing x: wrapping must apply without a terminal resize.
	const {lastFrame, rerender, unmount} = render(pane(false));
	rerender(pane(true));
	const rows = (lastFrame() ?? '').split('\n');
	unmount();
	t.true(rows.some(row => row.includes('zzzz')));
	t.true(rows.some(row => row.trimEnd().endsWith('out LAST LINE')));
	t.true(rows.every(row => row.length <= 40));
});

test('? opens the help panel with every action key and Esc closes it', async t => {
	const {stdin, lastFrame, unmount} = render(
		<Shell apps={[project()]} version="9.9.9" />,
	);
	await delay(20);
	stdin.write('?');
	await delay(20);
	const open = lastFrame() ?? '';
	stdin.write('\u001B');
	await delay(40);
	const closed = lastFrame() ?? '';
	unmount();

	t.true(open.includes('Keys'));
	t.true(open.includes('Deploy (force)'));
	// Floats over the frame instead of replacing the content pane.
	t.true(open.includes('╭'));
	t.true(open.includes('v9.9.9'));
	t.false(closed.includes('Deploy (force)'));
});

test('the changelog panel starts at the newest release', async t => {
	const newest = /^## (?<version>.+)$/m.exec(
		fs.readFileSync('CHANGELOG.md', 'utf8'),
	)?.groups?.['version'];
	const {lastFrame, unmount} = render(
		<ChangelogPanel height={10} onClose={() => {}} />,
	);
	await delay(20);
	const frame = lastFrame() ?? '';
	unmount();

	t.truthy(newest);
	t.true(frame.includes(newest!));
	t.false(frame.includes('# Changelog'));
});

test('after an upgrade the shell opens the changelog since the old version', async t => {
	const headings = fs
		.readFileSync('CHANGELOG.md', 'utf8')
		.split('\n')
		.filter(line => line.startsWith('## '))
		.map(line => line.slice(3));
	t.true(headings.length >= 3);
	const [newest, since, older] = headings as [string, string, string];

	const panel = render(
		<ChangelogPanel since={since} height={60} onClose={() => {}} />,
	);
	await delay(20);
	const frame = panel.lastFrame() ?? '';
	panel.unmount();
	t.true(frame.includes(newest));
	t.false(frame.includes(older));

	const shell = render(
		<Shell apps={[project()]} version="9.9.9" updatedFrom={since} />,
	);
	await delay(20);
	const opened = shell.lastFrame() ?? '';
	shell.unmount();
	t.true(opened.includes(`What's new since ${since}`));
});

test('the narrow strip scrolls to keep the selected app visible', t => {
	const apps = Array.from({length: 20}, (_, i) =>
		project(`App ${String(i).padStart(2, '0')}`),
	);
	const {lastFrame} = render(
		<NavigatorStrip apps={apps} selected={15} focused width={60} />,
	);
	const frame = lastFrame() ?? '';
	t.true(frame.includes('App 15'));
	t.false(frame.includes('App 00'));
});

test('a short content pane clips the overview instead of squeezing rows', t => {
	const {lastFrame} = render(
		<Box flexDirection="column" height={6} overflow="hidden">
			<Overview project={project('Demo')} tasks={[]} height={6} />
		</Box>,
	);
	const frame = lastFrame() ?? '';
	// The first rows survive intact and the rest are cut, not merged.
	t.true(frame.includes('id '));
	t.true(frame.includes('version'));
	t.false(frame.includes('signing user'));
	t.is(frame.split('\n').length, 6);
});
