import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import {debug, debugFile, enableDebug} from '../source/utils/debug.js';

test('debug is silent until enabled, then appends timestamped lines', t => {
	t.is(debugFile(), undefined);
	debug('http', 'dropped');

	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-debug-'));
	const file = enableDebug(dir);
	t.is(file, path.join(dir, 'debug.log'));
	t.is(enableDebug('/elsewhere'), file);

	debug('http', 'GET example.test/rest-api -> 200');
	debug('crash', 'Error: boom\n    at main');

	const lines = fs.readFileSync(file, 'utf8').split('\n');
	t.regex(lines[0]!, /^\d{4}-\d\d-\d\dT[\d.:]+Z http {5}GET example\.test/);
	t.regex(lines[1]!, /crash {4}Error: boom$/);
	t.regex(lines[2]!, /^ {38}at main$/);
	t.is(lines[3], '');
});
