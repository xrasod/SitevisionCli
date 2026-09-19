import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import test from 'ava';

const cliPath = fileURLToPath(new URL('../source/cli.tsx', import.meta.url));
const tsconfig = fileURLToPath(new URL('../tsconfig.json', import.meta.url));
const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;

function makeApp(manifest: Record<string, unknown>): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-cli-'));
	fs.mkdirSync(path.join(root, '.git'));
	fs.mkdirSync(path.join(root, 'src'));
	fs.writeFileSync(path.join(root, 'package.json'), '{"name":"fixture"}');
	fs.writeFileSync(
		path.join(root, 'src', 'manifest.json'),
		JSON.stringify(manifest),
	);
	fs.writeFileSync(path.join(root, 'src', 'index.js'), '// app\n');
	return root;
}

const plainApp = {
	id: 'fixture',
	version: '1.0.0',
	name: 'Fixture',
	type: 'WebApp',
};

// Runs the CLI with piped stdio, the way CI does. Resolves to null on a hang.
function svc(
	cwd: string,
	args: string[],
): Promise<{code: number | null; output: string}> {
	return new Promise(resolve => {
		const child = spawn(process.execPath, ['--import', tsx, cliPath, ...args], {
			cwd,
			env: {
				...process.env,
				XDG_CONFIG_HOME: path.join(cwd, '.xdg'),
				SVC_NO_KEYCHAIN: '1',
				TSX_TSCONFIG_PATH: tsconfig,
			},
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		let output = '';
		child.stdout.on('data', chunk => {
			output += String(chunk);
		});
		child.stderr.on('data', chunk => {
			output += String(chunk);
		});
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
		}, 15_000);
		child.on('close', code => {
			clearTimeout(timer);
			resolve({code, output});
		});
	});
}

test('build without a TTY builds the zip and exits 0 on its own', async t => {
	const root = makeApp(plainApp);
	const {code, output} = await svc(root, ['build']);
	t.is(code, 0, `output: ${output}`);
	t.true(fs.existsSync(path.join(root, 'dist', 'fixture.zip')));
});

test('build --no-zip skips the zip', async t => {
	const root = makeApp(plainApp);
	const {code, output} = await svc(root, ['build', '--no-zip']);
	t.is(code, 0, `output: ${output}`);
	t.false(fs.existsSync(path.join(root, 'dist', 'fixture.zip')));
});

test('a failed build exits 1', async t => {
	const root = makeApp({...plainApp, bundled: true});
	const {code, output} = await svc(root, ['build']);
	t.is(code, 1, `output: ${output}`);
	t.regex(output, /No webpack.config.js found/);
});

test('an unknown flag is rejected instead of ignored', async t => {
	const root = makeApp(plainApp);
	const {code, output} = await svc(root, ['build', '--producton']);
	t.not(code, 0, `output: ${output}`);
	t.regex(output, /producton/);
});

test('-s means --signed', async t => {
	const root = makeApp(plainApp);
	const {code, output} = await svc(root, ['watch', '-s']);
	t.is(code, 1, `output: ${output}`);
	t.regex(output, /Signing credentials not configured/);
});

test('an unknown command exits 1', async t => {
	const root = makeApp(plainApp);
	const {code} = await svc(root, ['frobnicate']);
	t.is(code, 1);
});

test('--help lists every command and flag that exists', async t => {
	const root = makeApp(plainApp);
	const {code, output} = await svc(root, ['--help']);
	t.is(code, 0, `output: ${output}`);
	for (const word of [
		'setup-signing',
		'--signed',
		'--force',
		'--production',
		'--activate',
		'--no-zip',
	]) {
		t.true(output.includes(word), `missing: ${word}`);
	}
});

test('deploy without a terminal or a password says so and exits 1', async t => {
	const root = makeApp(plainApp);
	fs.writeFileSync(
		path.join(root, '.dev_properties.json'),
		JSON.stringify({
			domain: 'site.example',
			siteName: 'Site',
			addonName: 'Addon',
			username: 'me',
		}),
	);
	const {code, output} = await svc(root, ['deploy']);
	t.is(code, 1, `output: ${output}`);
	t.regex(output, /Password is required/);
	t.notRegex(output, /TypeError/);
});

test('credentials are not accepted on the command line', async t => {
	const root = makeApp(plainApp);
	for (const flag of ['--token', '--cookie']) {
		// eslint-disable-next-line no-await-in-loop
		const {code, output} = await svc(root, ['deploy', flag, 'secret-value']);
		t.not(code, 0, `output: ${output}`);
		t.regex(output, /unknown flag/i);
	}
});
