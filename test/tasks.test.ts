import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {detectProject} from '../source/utils/project-detection.js';
import {startBuild, getTasks, type Task} from '../source/utils/tasks.js';

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
