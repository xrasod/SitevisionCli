// Loaded through NODE_OPTIONS into every process the scaffolder starts: hands
// sitevision-scripts svc's prompt bridge in place of inquirer.
import module from 'node:module';
import path from 'node:path';

const stub = new URL(
	`inquirer-stub${path.extname(import.meta.url)}`,
	import.meta.url,
).href;

// Missing before Node 22.15; svc then finds the run unmanaged and falls back.
module.registerHooks?.({
	resolve(specifier, context, nextResolve) {
		if (
			specifier === 'inquirer' &&
			context.parentURL?.includes('sitevision-scripts')
		) {
			return {url: stub, shortCircuit: true};
		}

		return nextResolve(specifier, context);
	},
});
