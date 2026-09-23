import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {type AddressInfo} from 'node:net';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import ava from 'ava';

// Each test spawns a fresh Node with tsx. Run them one at a time so 16 cold
// starts do not race each other and the kill timer on a two-core CI runner.
const test = ava.serial;

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
	input = '',
	env: Record<string, string> = {},
): Promise<{code: number | null; output: string}> {
	// A developer's own credentials must never reach a test run.
	const inherited = Object.fromEntries(
		Object.entries(process.env).filter(
			([name]) => !name.startsWith('SITEVISION_'),
		),
	);
	return new Promise(resolve => {
		const child = spawn(process.execPath, ['--import', tsx, cliPath, ...args], {
			cwd,
			env: {
				...inherited,
				XDG_CONFIG_HOME: path.join(cwd, '.xdg'),
				SVC_NO_KEYCHAIN: '1',
				TSX_TSCONFIG_PATH: tsconfig,
				...env,
			},
			stdio: ['pipe', 'pipe', 'pipe'],
		});
		child.stdin.end(input);
		let output = '';
		child.stdout.on('data', chunk => {
			output += String(chunk);
		});
		child.stderr.on('data', chunk => {
			output += String(chunk);
		});
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
		}, 60_000);
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

test('setup-signing adds the signing user and leaves everything else alone', async t => {
	const root = makeApp(plainApp);
	const file = path.join(root, '.dev_properties.json');
	fs.writeFileSync(
		file,
		JSON.stringify({
			domain: 'site.example',
			siteName: 'Site',
			addonName: 'Addon',
			username: 'me',
			password: 'hunter2',
		}),
	);
	const {code, output} = await svc(
		root,
		['setup-signing'],
		'signer@example.com\nMy Cert\n',
	);
	t.is(code, 0, `output: ${output}`);
	t.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), {
		domain: 'site.example',
		siteName: 'Site',
		addonName: 'Addon',
		username: 'me',
		password: 'hunter2',
		signingUsername: 'signer@example.com',
		certificateName: 'My Cert',
	});
});

test('setup-signing without a username exits 1', async t => {
	const root = makeApp(plainApp);
	const {code, output} = await svc(root, ['setup-signing'], '\n');
	t.is(code, 1, `output: ${output}`);
	t.regex(output, /username is required/i);
});

test('dev and deploy name the missing setting instead of posting to "undefined"', async t => {
	for (const command of ['dev', 'deploy']) {
		const root = makeApp(plainApp);
		fs.writeFileSync(
			path.join(root, 'package.json'),
			JSON.stringify({name: 'fixture', addonName: 'Only the addon'}),
		);
		// eslint-disable-next-line no-await-in-loop
		const {code, output} = await svc(root, [command]);
		t.is(code, 1, `${command}: ${output}`);
		t.regex(output, /missing "domain"/, `command: ${command}`);
		t.notRegex(output, /undefined/, `command: ${command}`);
	}
});

test('build --no-zip leaves no zip behind for a sitevision-scripts build either', async t => {
	const root = makeApp({...plainApp, bundled: true});
	const bin = path.join(
		root,
		'node_modules',
		'@sitevision',
		'sitevision-scripts',
		'bin',
	);
	fs.mkdirSync(bin, {recursive: true});
	// Stands in for sitevision-scripts, which always writes the zip itself.
	fs.writeFileSync(
		path.join(bin, 'sitevision-scripts.js'),
		"const fs = require('node:fs'); fs.mkdirSync('dist', {recursive: true}); fs.writeFileSync('dist/fixture.zip', 'PK'); console.log('built by the fake');",
	);

	const zip = path.join(root, 'dist', 'fixture.zip');
	const kept = await svc(root, ['build']);
	t.is(kept.code, 0, `output: ${kept.output}`);
	t.regex(kept.output, /built by the fake/);
	t.true(fs.existsSync(zip));

	const skipped = await svc(root, ['build', '--no-zip']);
	t.is(skipped.code, 0, `output: ${skipped.output}`);
	t.false(fs.existsSync(zip));
});

test('build then deploy runs unattended with the password from the environment', async t => {
	const requests: string[] = [];
	const server = http.createServer((req, res) => {
		requests.push(`${req.method} ${req.url}`);
		req.resume();
		req.on('end', () => {
			res.writeHead(200, {'content-type': 'application/json'});
			res.end(JSON.stringify({id: '360.1'}));
		});
	});
	await new Promise<void>(resolve => {
		server.listen(0, '127.0.0.1', resolve);
	});
	t.teardown(() => server.close());
	const {port} = server.address() as AddressInfo;

	const root = makeApp(plainApp);
	fs.writeFileSync(
		path.join(root, '.dev_properties.json'),
		JSON.stringify({
			domain: `127.0.0.1:${port}`,
			siteName: 'Site',
			addonName: 'Addon',
			username: 'me',
			useHTTPForDevDeploy: true,
		}),
	);
	const built = await svc(root, ['build']);
	t.is(built.code, 0, `output: ${built.output}`);

	const deployed = await svc(root, ['deploy'], '', {
		SITEVISION_DEPLOY_PASSWORD: 'pw',
	});
	t.is(deployed.code, 0, `output: ${deployed.output}`);
	t.notRegex(deployed.output, /Raw mode|TypeError/);
	// Every log line is printed once, not once per render.
	t.is(deployed.output.split('POST multipart').length - 1, 1);
	t.is(deployed.output.split('Deployment successful').length - 1, 1);
	t.is(requests.length, 1);
	t.regex(requests[0]!, /^POST .*Addon/);
});

test('setup-signing --global saves to the settings file, not the project', async t => {
	const root = makeApp(plainApp);
	const {code, output} = await svc(
		root,
		['setup-signing', '--global'],
		'signer@example.com\n\n',
	);
	t.is(code, 0, `output: ${output}`);
	t.false(fs.existsSync(path.join(root, '.dev_properties.json')));
	const saved = JSON.parse(
		fs.readFileSync(
			path.join(root, '.xdg', 'sitevision-cli', 'config.json'),
			'utf8',
		),
	) as Record<string, unknown>;
	t.is(saved['signingUsername'], 'signer@example.com');
});

test('a settings file that does not parse is reported and left alone', async t => {
	const root = makeApp(plainApp);
	const file = path.join(root, '.xdg', 'sitevision-cli', 'config.json');
	fs.mkdirSync(path.dirname(file), {recursive: true});
	fs.writeFileSync(file, '{"language": "sv",,}');
	const {code, output} = await svc(
		root,
		['setup-signing', '--global'],
		'me\n\n',
	);
	t.is(code, 1, `output: ${output}`);
	t.regex(output, /does not parse/);
	t.is(fs.readFileSync(file, 'utf8'), '{"language": "sv",,}');
});
