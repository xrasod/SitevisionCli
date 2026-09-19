import test from 'ava';
import {ProcessRunner} from '../source/utils/process-runner.js';

test('exit codes pass through', async t => {
	const ok = await new ProcessRunner('node', ['-e', '0']).run();
	t.is(ok.exitCode, 0);
	const bad = await new ProcessRunner('node', [
		'-e',
		'"process.exit(3)"',
	]).run();
	t.is(bad.exitCode, 3);
});

test('a child killed by a signal is a failure, not exit code 0', async t => {
	const runner = new ProcessRunner('node', [
		'-e',
		'"setInterval(() => {}, 1000)"',
	]);
	const done = runner.run();
	setTimeout(() => {
		runner.kill();
	}, 300);
	const {exitCode} = await done;
	t.not(exitCode, 0);
});
