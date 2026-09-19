import test from 'ava';
import {isNewer} from '../source/utils/version-check.js';

test('isNewer compares the numeric core', t => {
	t.true(isNewer('1.0.1', '1.0.0'));
	t.true(isNewer('1.1.0', '1.0.9'));
	t.false(isNewer('1.0.0', '1.0.0'));
	t.false(isNewer('0.9.9', '1.0.0'));
});

test('a stable release is newer than its own pre-releases', t => {
	t.true(isNewer('1.0.0', '1.0.0-beta.32'));
	t.false(isNewer('1.0.0-beta.32', '1.0.0'));
	t.false(isNewer('1.0.0-beta.33', '1.0.0-beta.32'));
});
