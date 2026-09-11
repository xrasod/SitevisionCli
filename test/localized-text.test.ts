import test from 'ava';
import {localizedText} from '../source/utils/project-detection.js';

test('returns a plain string unchanged', t => {
	t.is(localizedText('My App'), 'My App');
});

test('prefers the UI language for a localized object', t => {
	t.is(
		localizedText({sv: 'Mitt tillägg', en: 'My addon'}, 'sv'),
		'Mitt tillägg',
	);
	t.is(localizedText({sv: 'Mitt tillägg', en: 'My addon'}), 'My addon');
});

test('falls back to English when Swedish is absent', t => {
	t.is(localizedText({en: 'My addon', de: 'Mein Addon'}), 'My addon');
});

test('falls back to any language when neither sv nor en is present', t => {
	t.is(localizedText({de: 'Mein Addon'}), 'Mein Addon');
});

test('honours an explicit preferred language', t => {
	t.is(localizedText({sv: 'Namn', en: 'Name'}, 'en'), 'Name');
});

test('returns an empty string for undefined or empty values', t => {
	t.is(localizedText(undefined), '');
	t.is(localizedText({}), '');
});
