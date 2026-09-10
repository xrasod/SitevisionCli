import test from 'ava';
import {selectSessionCookie} from '../source/utils/session-cookie-auth.js';

test('selectSessionCookie builds a header from cookies on the deploy host', t => {
	const result = selectSessionCookie(
		[
			{name: 'JSESSIONID', value: 'abc', domain: 'www.example.com'},
			{name: 'OTHER', value: 'z', domain: 'www.example.com'},
			{name: 'IGNORED', value: 'q', domain: 'idp.other.com'},
		],
		'www.example.com',
	);
	t.is(result.cookie, 'JSESSIONID=abc; OTHER=z');
});

test('selectSessionCookie matches a JSESSIONID on a sibling host', t => {
	// Configured domain is the bare host; cookie is on the www subdomain.
	const result = selectSessionCookie(
		[{name: 'JSESSIONID', value: 'abc', domain: 'www.example.com'}],
		'example.com',
	);
	t.is(result.cookie, 'JSESSIONID=abc');
});

test('selectSessionCookie reports diagnostics when no JSESSIONID is present', t => {
	const result = selectSessionCookie(
		[{name: 'nonce', value: 'x', domain: 'login.idp.com'}],
		'www.example.com',
	);
	t.falsy(result.cookie);
	t.regex(result.error ?? '', /No JSESSIONID/);
	// Names the domains it actually saw, to guide the user.
	t.regex(result.error ?? '', /login\.idp\.com/);
});
