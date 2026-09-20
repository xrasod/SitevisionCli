import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {type AddressInfo} from 'node:net';
import {detectProject} from '../source/utils/project-detection.js';
import {
	logLines,
	serialized,
	createTask,
	stoppableTasks,
	scaffoldRunning,
	startBuild,
	startDeploy,
	startDev,
	getTasks,
	type Task,
} from '../source/utils/tasks.js';
import {getSessionCookie, setSessionCookie} from '../source/utils/keychain.js';

async function settled(task: Task): Promise<Task> {
	while (task.status === 'running') {
		// eslint-disable-next-line no-await-in-loop
		await new Promise(resolve => {
			setTimeout(resolve, 20);
		});
	}

	return task;
}

test('a build task for a non-bundled app produces the zip and logs its steps', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-task-'));
	fs.writeFileSync(
		path.join(root, 'manifest.json'),
		JSON.stringify({
			id: 'plain',
			name: 'Plain',
			version: '1.0.0',
			type: 'WebApp',
		}),
	);
	fs.writeFileSync(path.join(root, 'package.json'), '{}');
	fs.mkdirSync(path.join(root, 'src'));
	fs.writeFileSync(path.join(root, 'src', 'index.js'), '// hi');

	const project = detectProject(root)!;
	const task = await settled(startBuild(project));

	t.is(task.status, 'success', task.error);
	t.true(fs.existsSync(path.join(root, 'dist', 'plain.zip')));
	t.true(task.lines.some(l => l.tag === 'bld' && l.level === 'ok'));
	t.true(getTasks().includes(task));
});

test('watch ignores events that change no file and rebuilds on a real edit', async t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-watch-'));
	fs.writeFileSync(
		path.join(root, 'manifest.json'),
		JSON.stringify({
			id: 'plain',
			name: 'Plain',
			version: '1.0.0',
			type: 'WebApp',
		}),
	);
	fs.writeFileSync(path.join(root, 'package.json'), '{}');
	fs.mkdirSync(path.join(root, 'src'));
	const source = path.join(root, 'src', 'index.js');
	fs.writeFileSync(source, '// hi');

	const task = startDev(detectProject(root)!, {deploy: false});
	const builds = () =>
		task.lines.filter(l => l.text === 'copying source files').length;
	const until = async (check: () => boolean) => {
		for (let i = 0; i < 100 && !check(); i++) {
			// eslint-disable-next-line no-await-in-loop
			await new Promise(resolve => {
				setTimeout(resolve, 50);
			});
		}

		return check();
	};

	t.true(await until(() => task.phase === 'watching'));
	t.is(builds(), 1);

	// A dotfile (swap file, .DS_Store) fires an event but changes nothing.
	fs.writeFileSync(path.join(root, 'src', '.swp'), '');
	t.true(
		await until(() => task.lines.some(l => l.text.includes('ignored'))),
		task.lines.map(l => l.text).join('\n'),
	);
	t.is(builds(), 1);

	fs.writeFileSync(source, '// changed');
	t.true(await until(() => builds() === 2));
	task.stop();
	t.is(task.status, 'stopped');
});

test('log text is split on CRLF too, and loses terminal control codes', t => {
	t.deepEqual(logLines('one\r\ntwo\r\n'), ['one', 'two']);
	t.deepEqual(logLines('\u001B[32mgreen\u001B[0m\nplain'), ['green', 'plain']);
	t.deepEqual(logLines('progress 10%\rprogress 90%'), ['progress 90%']);
});

const delay = async (ms: number) =>
	new Promise(resolve => {
		setTimeout(resolve, ms);
	});

test('serialized runs one at a time and only keeps the latest waiting value', async t => {
	const started: number[] = [];
	const finished: number[] = [];
	const release: Array<() => void> = [];
	const deploy = serialized(async (version: number) => {
		started.push(version);
		await new Promise<void>(resolve => {
			release.push(resolve);
		});
		finished.push(version);
	});

	// Three quick saves while the first deploy is still uploading.
	const first = deploy(1);
	void deploy(2);
	void deploy(3);
	t.deepEqual(started, [1]);

	release[0]!();
	await delay(10);
	// 2 was superseded; 3 only starts once 1 is done, so it is what ends up live.
	t.deepEqual(started, [1, 3]);
	t.deepEqual(finished, [1]);
	release[1]!();
	await first;
	t.deepEqual(finished, [1, 3]);

	// Idle again: the next save runs straight away.
	const again = deploy(4);
	release[2]!();
	await again;
	t.deepEqual(finished, [1, 3, 4]);
});

test('serialized keeps going after a failed run', async t => {
	const seen: number[] = [];
	const run = serialized(async (value: number) => {
		seen.push(value);
		if (value === 1) throw new Error('boom');
	});
	await t.throwsAsync(run(1));
	await run(2);
	t.deepEqual(seen, [1, 2]);
});

test('a running scaffold can be stopped from whichever app is selected', t => {
	const noop = () => {};
	const app = {root: '/ws/apps/one', manifest: {id: 'one', name: 'One'}};
	const other = {root: '/ws/apps/two', manifest: {id: 'two', name: 'Two'}};
	const scaffold = createTask(
		'create',
		{root: '/ws/apps/brand-new', manifest: {id: 'brand-new', name: 'New'}},
		'create-sitevision-app',
		noop,
	);
	const build = createTask('build', other, 'build', noop);

	t.deepEqual(stoppableTasks(app.root), [scaffold.task]);
	t.deepEqual(stoppableTasks(other.root), [scaffold.task, build.task]);
	t.true(scaffoldRunning());

	scaffold.finish('stopped');
	build.finish('stopped');
	t.deepEqual(stoppableTasks(other.root), []);
	t.false(scaffoldRunning());
});

test('a deploy that finds the session expired drops the stored cookie', async t => {
	const server = http.createServer((req, res) => {
		req.resume();
		req.on('end', () => {
			res.writeHead(401);
			res.end();
		});
	});
	await new Promise<void>(resolve => {
		server.listen(0, '127.0.0.1', resolve);
	});
	t.teardown(() => server.close());
	const domain = `127.0.0.1:${(server.address() as AddressInfo).port}`;

	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-task-'));
	fs.mkdirSync(path.join(root, 'dist'));
	fs.writeFileSync(
		path.join(root, 'manifest.json'),
		JSON.stringify({id: 'x', name: 'X', version: '1.0.0', type: 'WebApp'}),
	);
	fs.writeFileSync(path.join(root, 'package.json'), '{}');
	fs.writeFileSync(path.join(root, 'dist', 'x.zip'), 'PK fake zip');

	setSessionCookie(domain, 'me', 'JSESSIONID=stale');
	const task = await settled(
		startDeploy(
			detectProject(root)!,
			{
				domain,
				siteName: 'Site',
				addonName: 'Addon',
				username: 'me',
				sessionCookie: 'JSESSIONID=stale',
				useHTTP: true,
			},
			{},
		),
	);
	t.is(task.status, 'error');
	t.is(getSessionCookie(domain, 'me'), null);
});
