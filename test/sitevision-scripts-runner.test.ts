import fs from 'fs';
import os from 'os';
import path from 'path';
import test from 'ava';
import {
	getSitevisionScriptsBin,
	hasSitevisionScripts,
	runSitevisionScriptsBuild,
	getDelegatedZipPath,
	getSitevisionScriptsVersion,
	checkSitevisionScriptsCompatibility,
	SUPPORTED_SITEVISION_SCRIPTS_RANGE,
} from '../source/utils/sitevision-scripts-runner.js';

const BIN_REL = path.join(
	'node_modules',
	'@sitevision',
	'sitevision-scripts',
	'bin',
	'sitevision-scripts.js',
);

function makeProject(binBody?: string): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-svs-'));
	if (binBody !== undefined) {
		const binPath = path.join(dir, BIN_REL);
		fs.mkdirSync(path.dirname(binPath), {recursive: true});
		fs.writeFileSync(binPath, binBody);
	}

	return dir;
}

function makeProjectWithVersion(version: string | null): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-svs-'));
	const pkgDir = path.join(
		dir,
		'node_modules',
		'@sitevision',
		'sitevision-scripts',
	);
	fs.mkdirSync(pkgDir, {recursive: true});
	const pkg = version === null ? {name: 'x'} : {name: 'x', version};
	fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(pkg));
	// Also drop a bin so hasSitevisionScripts() is true.
	fs.mkdirSync(path.join(pkgDir, 'bin'), {recursive: true});
	fs.writeFileSync(
		path.join(pkgDir, 'bin', 'sitevision-scripts.js'),
		'// stub',
	);
	return dir;
}

test('getSitevisionScriptsVersion reads the installed version', t => {
	t.is(getSitevisionScriptsVersion(makeProjectWithVersion('8.2.1')), '8.2.1');
	t.is(getSitevisionScriptsVersion(makeProject()), null);
});

test('compatibility: in-range versions are ok', t => {
	for (const version of ['8.0.0', '8.5.12', '8.99.0']) {
		const result = checkSitevisionScriptsCompatibility(
			makeProjectWithVersion(version),
		);
		t.is(result.status, 'ok', `expected ${version} to be ok`);
		t.is(result.warning, undefined, `expected no warning for ${version}`);
		t.is(result.supportedRange, SUPPORTED_SITEVISION_SCRIPTS_RANGE);
	}
});

test('compatibility: a newer major warns as too-new', t => {
	const result = checkSitevisionScriptsCompatibility(
		makeProjectWithVersion('9.0.0'),
	);
	t.is(result.status, 'too-new');
	t.regex(result.warning ?? '', /newer than/);
});

test('compatibility: an older version warns as too-old', t => {
	const result = checkSitevisionScriptsCompatibility(
		makeProjectWithVersion('7.4.0'),
	);
	t.is(result.status, 'too-old');
	t.regex(result.warning ?? '', /older than/);
});

test('compatibility: missing / unparseable versions do not warn', t => {
	t.is(
		checkSitevisionScriptsCompatibility(makeProject()).status,
		'not-installed',
	);
	t.is(
		checkSitevisionScriptsCompatibility(makeProjectWithVersion(null)).status,
		'unknown',
	);
});

test('detection returns null / false when the package is absent', t => {
	const dir = makeProject();
	t.is(getSitevisionScriptsBin(dir), null);
	t.false(hasSitevisionScripts(dir));
});

test('detection resolves the bin when the package is present', t => {
	const dir = makeProject('// stub');
	t.is(getSitevisionScriptsBin(dir), path.join(dir, BIN_REL));
	t.true(hasSitevisionScripts(dir));
});

test('getDelegatedZipPath matches sitevision-scripts app-id convention', t => {
	const prevPrefix = process.env['APP_ID_PREFIX'];
	const prevSuffix = process.env['APP_ID_SUFFIX'];
	delete process.env['APP_ID_PREFIX'];
	delete process.env['APP_ID_SUFFIX'];

	try {
		// Default: appId === manifest.id
		t.is(
			getDelegatedZipPath('/proj', 'my-app'),
			path.join('/proj', 'dist', 'my-app.zip'),
		);

		// Honors the package's own env vars (NOT the CLI's SITEVISION_* ones).
		process.env['APP_ID_PREFIX'] = 'acme-';
		process.env['APP_ID_SUFFIX'] = '-v2';
		t.is(
			getDelegatedZipPath('/proj', 'my-app'),
			path.join('/proj', 'dist', 'acme-my-app-v2.zip'),
		);
	} finally {
		if (prevPrefix === undefined) {
			delete process.env['APP_ID_PREFIX'];
		} else {
			process.env['APP_ID_PREFIX'] = prevPrefix;
		}

		if (prevSuffix === undefined) {
			delete process.env['APP_ID_SUFFIX'];
		} else {
			process.env['APP_ID_SUFFIX'] = prevSuffix;
		}
	}
});

test('runSitevisionScriptsBuild fails clearly when the package is missing', async t => {
	const dir = makeProject();
	const result = await runSitevisionScriptsBuild(dir);
	t.false(result.success);
	t.regex(result.error ?? '', /not found/);
});

test('runSitevisionScriptsBuild reports success and streams output', async t => {
	// Fake bin: prints a line then exits 0, like a successful build would.
	const dir = makeProject(
		'process.stdout.write("Compilation successful\\n");\nprocess.exit(0);\n',
	);

	let streamed = '';
	const result = await runSitevisionScriptsBuild(dir, chunk => {
		streamed += chunk;
	});

	t.true(result.success);
	t.regex(streamed, /Compilation successful/);
	t.regex(result.output, /Compilation successful/);
});

const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
};

async function waitFor(check: () => boolean, ms = 5000) {
	const end = Date.now() + ms;
	while (!check() && Date.now() < end) {
		// eslint-disable-next-line no-await-in-loop
		await new Promise(resolve => {
			setTimeout(resolve, 20);
		});
	}
}

test('aborting runSitevisionScriptsBuild kills the build and what it started', async t => {
	// Fake bin: starts a long-running child of its own, then waits forever.
	const dir = makeProject(
		'const {spawn} = require("child_process");\n' +
			'const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {stdio: "ignore"});\n' +
			'require("fs").writeFileSync("grandchild.pid", String(child.pid));\n' +
			'setInterval(() => {}, 1000);\n',
	);
	const pidFile = path.join(dir, 'grandchild.pid');
	const controller = new AbortController();
	const running = runSitevisionScriptsBuild(dir, undefined, controller.signal);
	await waitFor(() => fs.existsSync(pidFile));
	const pid = Number(fs.readFileSync(pidFile, 'utf8'));
	t.true(alive(pid));

	controller.abort();
	const result = await running;
	t.false(result.success);
	t.regex(result.error ?? '', /stopped/);
	await waitFor(() => !alive(pid));
	t.false(alive(pid), 'the child the build started is gone too');
});

test('runSitevisionScriptsBuild reports failure on a non-zero exit', async t => {
	const dir = makeProject(
		'process.stderr.write("boom\\n");\nprocess.exit(2);\n',
	);

	const result = await runSitevisionScriptsBuild(dir);
	t.false(result.success);
	t.regex(result.error ?? '', /exited with code 2/);
	t.regex(result.output, /boom/);
});
