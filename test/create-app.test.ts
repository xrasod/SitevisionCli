import test from 'ava';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import {
	appNameAdvice,
	appNameProblem,
	seedNewApp,
	startCreateApp,
	validAppName,
	type PromptQuestion,
} from '../source/utils/create-app.js';
import {detectProject} from '../source/utils/project-detection.js';

// A stand-in for create-sitevision-app: asks through `inquirer` from inside a
// sitevision-scripts path, the way the real init script does.
function fakeScaffolder(usesInquirer: boolean): string {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-fake-'));
	const scripts = path.join(
		dir,
		'node_modules',
		'@sitevision',
		'sitevision-scripts',
	);
	fs.mkdirSync(scripts, {recursive: true});
	fs.writeFileSync(
		path.join(scripts, 'init.mjs'),
		usesInquirer
			? `
import fs from 'node:fs';
import path from 'node:path';
import inquirer from 'inquirer';
const app = path.resolve(process.argv[2]);
const answers = await inquirer.prompt([
	{name: 'type', type: 'list', message: 'Type?', choices: [{name: 'WebApp', value: 'web'}, {name: 'RESTApp', value: 'rest'}]},
	{name: 'ssr', type: 'confirm', message: 'SSR?', default: false, when: a => a.type === 'web'},
	{name: 'restOnly', message: 'Never asked', when: a => a.type === 'rest'},
	{name: 'domain', message: 'Domain', validate: v => (v.includes('.') ? true : 'Not a domain')},
	{name: 'password', type: 'password', message: 'Password'},
]);
fs.mkdirSync(app, {recursive: true});
fs.writeFileSync(path.join(app, 'answers.json'), JSON.stringify(answers));
fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify({name: path.basename(app), version: '0.0.1'}));
fs.writeFileSync(path.join(app, 'manifest.json'), JSON.stringify({id: path.basename(app), version: '0.0.1', type: 'WebApp', name: {en: 'WebApp boilerplate'}, author: 'My Company'}, null, 2));
`
			: `console.log('this version asks some other way');`,
	);
	return path.join(scripts, 'init.mjs');
}

const nativeTypeScript = Boolean(
	(process.features as {typescript?: unknown}).typescript,
);

(nativeTypeScript ? test : test.skip)(
	"the scaffolder's questions reach svc and the answers go back",
	async t => {
		const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-create-'));
		const asked: PromptQuestion[] = [];
		const {done} = startCreateApp({
			name: 'my-app',
			parentDir,
			command: ['node', fakeScaffolder(true)],
			async ask(question) {
				asked.push(question);
				if (question.name === 'type') return {value: 0};
				if (question.name === 'ssr') return {value: true};
				if (question.name === 'password') return {skip: true};
				// First answer fails the tool's own validation, so it asks again.
				return {value: question.error ? 'site.example' : 'nope'};
			},
		});
		t.is(await done, 'created');
		t.deepEqual(
			asked.map(q => [q.name, q.type, q.error]),
			[
				['type', 'list', undefined],
				['ssr', 'confirm', undefined],
				['domain', 'input', undefined],
				['domain', 'input', 'Not a domain'],
				['password', 'password', undefined],
			],
		);
		t.deepEqual(asked[0]!.choices, ['WebApp', 'RESTApp']);
		const written = fs.readFileSync(
			path.join(parentDir, 'my-app', 'answers.json'),
			'utf8',
		);
		t.deepEqual(JSON.parse(written), {
			type: 'web',
			ssr: true,
			domain: 'site.example',
		});
	},
);

test('a scaffolder that no longer asks through inquirer is reported as unmanaged', async t => {
	const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-create-'));
	const {done} = startCreateApp({
		name: 'my-app',
		parentDir,
		command: ['node', fakeScaffolder(false)],
		async ask() {
			t.fail('nothing should be asked');
			return null;
		},
	});
	t.is(await done, 'unmanaged');
});

test('seeding fills the manifest from the workspace and folds config into it', t => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-seed-'));
	fs.mkdirSync(path.join(root, '.git'));
	fs.writeFileSync(
		path.join(root, 'package.json'),
		JSON.stringify({
			author: {name: 'Team Web'},
			homepage: 'https://docs.example',
		}),
	);
	fs.writeFileSync(
		path.join(root, '.dev_properties.json'),
		JSON.stringify({domain: 'site.example', siteName: 'Site', username: 'me'}),
	);
	const app = path.join(root, 'webapps', 'my-app');
	fs.mkdirSync(app, {recursive: true});
	fs.writeFileSync(
		path.join(app, 'package.json'),
		'{"name":"my-app","version":"0.0.1"}',
	);
	fs.writeFileSync(
		path.join(app, 'manifest.json'),
		JSON.stringify(
			{
				id: 'my-app',
				version: '0.0.1',
				type: 'WebApp',
				name: {en: 'WebApp boilerplate'},
				author: 'My Company',
				helpUrl: 'https://example.com/webapps',
			},
			null,
			2,
		),
	);
	fs.writeFileSync(
		path.join(app, '.dev_properties.json'),
		JSON.stringify({
			domain: 'site.example',
			siteName: 'Site',
			addonName: 'My addon',
			username: 'me',
			useHTTPForDevDeploy: false,
		}),
	);

	seedNewApp(app, root);

	const project = detectProject(app)!;
	t.deepEqual(project.manifest.name, {en: 'my-app'});
	t.is(project.manifest.author, 'Team Web');
	t.is(project.manifest.helpUrl, 'https://docs.example');
	t.false(fs.existsSync(path.join(app, '.dev_properties.json')));
	t.is(project.devProperties?.addonName, 'My addon');
	t.is(project.devProperties?.domain, 'site.example');
});

test('validAppName accepts folder-safe names only', t => {
	t.true(validAppName('my-new_app.2'));
	t.false(validAppName('my app'));
	t.false(validAppName('../up'));
	t.false(validAppName(''));
});

test('a bad app name is explained with a name that would work', t => {
	t.is(appNameProblem('my-new_app.2'), undefined);
	t.is(
		appNameProblem('test test'),
		'An app name can\'t have spaces. Try "test-test".',
	);
	t.regex(
		appNameProblem('Min nya app!')!,
		/can't contain !: .* Try "min-nya-app"\./,
	);
	t.regex(appNameProblem('blåbär')!, /can't contain å ä: .* Try "blabar"\./);
	t.is(
		appNameProblem('-draft'),
		'Start the name with a letter or a digit. Try "draft".',
	);
	t.is(
		appNameProblem('  '),
		'Type a name for the app, for example my-new-app.',
	);
	// Capitals are allowed (Sitevision ids are often camelCase), just advised against.
	t.is(appNameProblem('MyNewApp'), undefined);
	t.regex(
		appNameAdvice('MyNewApp')!,
		/Try "my-new-app", or press Enter again to keep "MyNewApp"/,
	);
	t.is(appNameAdvice('my-new-app'), undefined);
	t.is(appNameAdvice('My App'), undefined, 'a blocking problem comes first');
	t.regex(appNameProblem('../up')!, /can't contain \/: .* Try "up"\./);
});
