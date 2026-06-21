import {fixupConfigRules} from '@eslint/compat';
import xoReact from 'eslint-config-xo-react';

/**
 * XO 3 (ESLint 9 flat config) is far stricter than the 0.53 line this project
 * was written against. The rules below all fire on existing, working, shipped
 * code. Rather than restyle the whole codebase during a dependency bump, they
 * are relaxed here to preserve the pre-upgrade lint baseline — new code still
 * gets linted, and these can be re-enabled and addressed incrementally.
 *
 * @type {import('xo').FlatXoConfig}
 */
const xoConfig = [
	{
		// Markdown code blocks aren't project source; don't lint them.
		ignores: ['**/*.md'],
	},
	{
		prettier: true,
	},
	// eslint-plugin-react still calls the removed `context.getSourceCode()`;
	// fixupConfigRules shims it for ESLint 9 compatibility.
	...fixupConfigRules(xoReact()),
	{
		rules: {
			'react/prop-types': 'off',

			// Pre-upgrade baseline — relaxed strict rules (see file header).
			'@typescript-eslint/strict-boolean-expressions': 'off',
			'@typescript-eslint/prefer-nullish-coalescing': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/no-unsafe-return': 'off',
			'@typescript-eslint/no-confusing-void-expression': 'off',
			'@typescript-eslint/no-floating-promises': 'off',
			'@typescript-eslint/strict-void-return': 'off',
			'@typescript-eslint/switch-exhaustiveness-check': 'off',
			'@typescript-eslint/restrict-plus-operands': 'off',
			'@typescript-eslint/naming-convention': 'off',
			'@typescript-eslint/promise-function-async': 'off',
			'@typescript-eslint/use-unknown-in-catch-callback-variable': 'off',
			'@typescript-eslint/consistent-type-definitions': 'off',
			'@typescript-eslint/consistent-type-imports': 'off',
			'@typescript-eslint/consistent-type-assertions': 'off',
			'@typescript-eslint/no-restricted-types': 'off',
			'@typescript-eslint/array-type': 'off',
			'@typescript-eslint/no-empty-function': 'off',
			'@typescript-eslint/prefer-readonly': 'off',
			'@typescript-eslint/no-unnecessary-type-conversion': 'off',
			'@typescript-eslint/no-unnecessary-type-assertion': 'off',

			'react/prefer-read-only-props': 'off',
			'react/jsx-no-leaked-render': 'off',
			'react/boolean-prop-naming': 'off',
			'react/no-array-index-key': 'off',
			'react/no-unescaped-entities': 'off',
			'react/jsx-tag-spacing': 'off',
			'react/jsx-curly-newline': 'off',
			'react/jsx-sort-props': 'off',
			'react/jsx-boolean-value': 'off',
			'react-hooks/immutability': 'off',
			'react-hooks/set-state-in-effect': 'off',

			'unicorn/switch-case-braces': 'off',
			'unicorn/escape-case': 'off',
			'unicorn/prefer-unicode-code-point-escapes': 'off',
			'unicorn/prevent-abbreviations': 'off',
			'unicorn/prefer-node-protocol': 'off',
			'unicorn/filename-case': 'off',
			'unicorn/text-encoding-identifier-case': 'off',
			'unicorn/no-declarations-before-early-exit': 'off',
			'unicorn/no-negated-condition': 'off',
			'unicorn/no-process-exit': 'off',
			'unicorn/prefer-switch': 'off',
			'unicorn/prefer-single-call': 'off',
			'unicorn/no-non-function-verb-prefix': 'off',
			'unicorn/prefer-string-slice': 'off',
			'unicorn/prefer-early-return': 'off',
			'unicorn/no-unnecessary-nested-ternary': 'off',
			'unicorn/prefer-code-point': 'off',
			'unicorn/prefer-number-coercion': 'off',
			'unicorn/consistent-optional-chaining': 'off',
			'unicorn/numeric-separators-style': 'off',
			'unicorn/no-useless-coercion': 'off',
			'unicorn/prefer-top-level-await': 'off',
			'unicorn/prefer-minimal-ternary': 'off',
			'unicorn/prefer-negative-index': 'off',
			'unicorn/prefer-at': 'off',
			'unicorn/no-useless-else': 'off',
			'unicorn/prefer-event-target': 'off',
			'unicorn/prefer-default-parameters': 'off',
			'unicorn/prefer-uint8array-base64': 'off',
			'unicorn/no-immediate-mutation': 'off',
			'unicorn/prefer-split-limit': 'off',
			'unicorn/consistent-class-member-order': 'off',
			'unicorn/prefer-string-raw': 'off',

			'jsdoc/require-asterisk-prefix': 'off',
			'jsdoc/informative-docs': 'off',
			'jsdoc/require-param': 'off',
			'jsdoc/check-param-names': 'off',

			'n/prefer-global/process': 'off',
			'n/prefer-global/buffer': 'off',
			'n/no-extraneous-import': 'off',

			'import-x/order': 'off',
			'import-x/no-duplicates': 'off',
			'import-x/no-extraneous-dependencies': 'off',

			'@stylistic/padding-line-between-statements': 'off',
			'@stylistic/quotes': 'off',

			curly: 'off',
			complexity: 'off',
			'max-params': 'off',
			'max-depth': 'off',
			'capitalized-comments': 'off',
			'no-negated-condition': 'off',
			'prefer-destructuring': 'off',
			'preserve-caught-error': 'off',
			'no-unassigned-vars': 'off',
			'no-else-return': 'off',
			'require-unicode-regexp': 'off',
			'prefer-exponentiation-operator': 'off',
		},
	},
	{
		// Low-level binary/IO modules. Bitwise math is inherent to ZIP/CRC-32
		// encoding, and the sequential awaits (deflating files one at a time,
		// retrying signing requests with backoff) are intentional rather than
		// accidentally serialized work.
		files: ['source/utils/zip.ts', 'source/utils/sitevision-api.ts'],
		rules: {
			'no-bitwise': 'off',
			'no-await-in-loop': 'off',
			'@stylistic/no-mixed-operators': 'off',
		},
	},
];

export default xoConfig;
