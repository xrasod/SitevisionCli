import React from 'react';
import test from 'ava';
import {render} from 'ink-testing-library';
import {KeychainPasswordChoice} from '../source/components/KeychainPasswordChoice.js';

const noop = () => {};
const ESC = String.fromCharCode(27);
const DOWN = ESC + '[B';
const delay = async (ms: number) =>
	new Promise(resolve => {
		setTimeout(resolve, ms);
	});

test('renders both options', t => {
	const {lastFrame} = render(
		<KeychainPasswordChoice
			onUseSaved={noop}
			onEnterNew={noop}
			onCancel={noop}
		/>,
	);
	const frame = lastFrame() ?? '';
	t.true(frame.includes('Use saved password from keychain'));
	t.true(frame.includes('Enter a new password'));
});

test('Enter on the first option uses the saved password', t => {
	let used = false;
	const {stdin} = render(
		<KeychainPasswordChoice
			onUseSaved={() => {
				used = true;
			}}
			onEnterNew={noop}
			onCancel={noop}
		/>,
	);
	stdin.write('\r'); // Enter — first option selected by default
	t.true(used);
});

test('arrow down then Enter chooses "enter new password"', async t => {
	let enteredNew = false;
	const {stdin} = render(
		<KeychainPasswordChoice
			onUseSaved={noop}
			onEnterNew={() => {
				enteredNew = true;
			}}
			onCancel={noop}
		/>,
	);
	stdin.write(DOWN);
	await delay(50);
	stdin.write('\r'); // Enter
	await delay(10);
	t.true(enteredNew);
});

test('Esc cancels', async t => {
	let cancelled = false;
	const {stdin} = render(
		<KeychainPasswordChoice
			onUseSaved={noop}
			onEnterNew={noop}
			onCancel={() => {
				cancelled = true;
			}}
		/>,
	);
	stdin.write(ESC);
	await delay(50);
	t.true(cancelled);
});
