import test from 'ava';
import {stripJsonComments, parseJsonc} from '../source/utils/jsonc.js';

test('strips // line comments', t => {
	t.deepEqual(parseJsonc('{"a": 1 // hi\n}'), {a: 1});
});

test('strips block comments', t => {
	t.deepEqual(parseJsonc('{/* x */ "a": 1}'), {a: 1});
});

test('preserves // inside string values (URLs)', t => {
	const parsed = parseJsonc<{url: string}>('{"url": "https://example.com"}');
	t.is(parsed.url, 'https://example.com');
});

test('preserves an escaped quote inside a string', t => {
	const parsed = parseJsonc<{s: string}>('{"s": "a\\"// not a comment"}');
	t.is(parsed.s, 'a"// not a comment');
});

test('leaves comment-free JSON unchanged', t => {
	t.is(stripJsonComments('{"a":1}'), '{"a":1}');
});
