import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'ava';
import {
	configProblem,
	getGlobalSigning,
	getSettings,
	setGlobalSigning,
	setLastSeenVersion,
	setSettings,
	settingsFile,
} from '../source/utils/config.js';
import {
	detectProject,
	writeDevProperties,
} from '../source/utils/project-detection.js';

function freshConfigHome(): void {
	process.env['XDG_CONFIG_HOME'] = fs.mkdtempSync(
		path.join(os.tmpdir(), 'svc-global-'),
	);
}

function writeGlobal(content: string): void {
	fs.mkdirSync(path.dirname(settingsFile()), {recursive: true});
	fs.writeFileSync(settingsFile(), content);
}

function makeApp(dev?: Record<string, unknown>): string {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'svc-global-app-'));
	fs.mkdirSync(path.join(root, '.git'));
	fs.writeFileSync(path.join(root, 'package.json'), '{"name":"a"}');
	fs.mkdirSync(path.join(root, 'src'));
	fs.writeFileSync(
		path.join(root, 'src', 'manifest.json'),
		JSON.stringify({id: 'a', version: '1.0.0', name: 'A', type: 'WebApp'}),
	);
	if (dev) {
		fs.writeFileSync(
			path.join(root, '.dev_properties.json'),
			JSON.stringify(dev),
		);
	}

	return root;
}

const site = {domain: 'site.example', siteName: 'Site', addonName: 'A'};

test.serial('new settings default to on', t => {
	freshConfigHome();
	const settings = getSettings();
	t.true(settings.updateCheck);
	t.true(settings.addonNameDriftWarning);
});

test.serial('settings round-trip and keep hand-written keys', t => {
	freshConfigHome();
	writeGlobal('{"somethingElse": 1}');
	setSettings({updateCheck: false, addonNameDriftWarning: false});
	t.false(getSettings().updateCheck);
	t.false(getSettings().addonNameDriftWarning);
	const onDisk = JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) as {
		somethingElse: number;
		warnings: {addonNameDrift: boolean};
	};
	t.is(onDisk.somethingElse, 1);
	t.false(onDisk.warnings.addonNameDrift);
});

test.serial('comments in the config file are fine', t => {
	freshConfigHome();
	writeGlobal('{\n// mine\n"signingUsername": "me@example.com"\n}');
	t.is(configProblem(), undefined);
	t.is(getGlobalSigning().signingUsername, 'me@example.com');
});

test.serial('a config file that does not parse is never overwritten', t => {
	freshConfigHome();
	const broken = '{"signingUsername": "me@example.com",,}';
	writeGlobal(broken);
	setLastSeenVersion('9.9.9');
	setSettings({updateCheck: false});
	setGlobalSigning({signingUsername: 'other'});
	t.is(fs.readFileSync(settingsFile(), 'utf8'), broken);
	t.truthy(configProblem());
});

test.serial('the global signing identity fills in under the project', t => {
	freshConfigHome();
	setGlobalSigning({signingUsername: 'me@example.com', certificateName: 'C'});

	const inherits = detectProject(makeApp(site))!;
	t.is(inherits.devProperties?.signingUsername, 'me@example.com');
	t.is(inherits.devProperties?.certificateName, 'C');
	t.true(inherits.hasSigningProperties);

	const overrides = detectProject(
		makeApp({...site, signingUsername: 'project@example.com'}),
	)!;
	t.is(overrides.devProperties?.signingUsername, 'project@example.com');
});

test.serial(
	'a global signing identity does not make a bare project look configured',
	t => {
		freshConfigHome();
		setGlobalSigning({signingUsername: 'me@example.com'});
		const project = detectProject(makeApp())!;
		t.false(project.hasDevProperties);
		t.is(project.devProperties, undefined);
	},
);

test.serial(
	'saving a project does not copy the global signing identity into it',
	t => {
		freshConfigHome();
		setGlobalSigning({signingUsername: 'me@example.com'});
		const root = makeApp(site);
		const project = detectProject(root)!;
		writeDevProperties(root, project.devProperties!);
		const onDisk = JSON.parse(
			fs.readFileSync(path.join(root, '.dev_properties.json'), 'utf8'),
		) as Record<string, unknown>;
		t.false(Object.hasOwn(onDisk, 'signingUsername'));
		t.is(onDisk['domain'], 'site.example');
	},
);
