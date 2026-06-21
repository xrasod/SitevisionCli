/**
 * Webpack Runner
 *
 * Handles webpack compilation for Sitevision apps.
 * Dynamically loads webpack from the target project's node_modules.
 */

import path from 'path';
import fs from 'fs';
import {createRequire} from 'module';
import type {BuildOptions, BuildResult} from '../types/index.js';
import {copyChunksToResources} from './zip.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Webpack module interface (minimal typing for dynamic import)
 */
interface WebpackModule {
	(config: WebpackConfig): WebpackCompiler;
	(config: WebpackConfig, callback: WebpackCallback): void;
}

interface WebpackConfig {
	mode?: 'development' | 'production';
	entry?: string | Record<string, string>;
	output?: {
		path?: string;
		filename?: string;
	};
	[key: string]: unknown;
}

interface WebpackCompiler {
	run(callback: WebpackCallback): void;
	watch(
		options: WebpackWatchOptions,
		callback: WebpackCallback,
	): WebpackWatching;
	close(callback: (err?: Error) => void): void;
}

interface WebpackWatching {
	close(callback?: () => void): void;
	invalidate(): void;
}

interface WebpackStats {
	hasErrors(): boolean;
	hasWarnings(): boolean;
	toString(options?: {colors?: boolean}): string;
	toJson(): {
		time?: number;
		hash?: string;
		errors?: Array<{message: string}>;
		warnings?: Array<{message: string}>;
		assets?: Array<{name: string}>;
	};
}

type WebpackCallback = (err: Error | null, stats?: WebpackStats) => void;

interface WebpackWatchOptions {
	aggregateTimeout?: number;
	ignored?: string | string[] | RegExp;
	poll?: boolean | number;
}

/**
 * Webpack config factory function type
 */
type WebpackConfigFactory = (options: {
	dev: boolean;
	cssPrefix: string;
	restApp: boolean;
}) => WebpackConfig;

// =============================================================================
// LOCAL CONFIG DETECTION
// =============================================================================

/**
 * Standard locations for a project-local webpack config, highest priority first.
 */
function localWebpackConfigPaths(projectRoot: string): string[] {
	return [
		path.join(projectRoot, 'webpack.config.js'),
		path.join(projectRoot, 'webpack.config.mjs'),
		path.join(projectRoot, 'config', 'webpack', 'webpack.config.js'),
	];
}

/**
 * Find the project's own webpack config, or null if it has none.
 */
export function findLocalWebpackConfig(projectRoot: string): string | null {
	return (
		localWebpackConfigPaths(projectRoot).find(p => fs.existsSync(p)) ?? null
	);
}

/**
 * Whether the project ships its own webpack config (in-house build path),
 * as opposed to relying on the sitevision-scripts package.
 */
export function hasLocalWebpackConfig(projectRoot: string): boolean {
	return findLocalWebpackConfig(projectRoot) !== null;
}

// =============================================================================
// WEBPACK RUNNER CLASS
// =============================================================================

export class WebpackRunner {
	private webpack: WebpackModule | null = null;
	private config: WebpackConfig | null = null;
	private compiler: WebpackCompiler | null = null;
	private watcher: WebpackWatching | null = null;
	private readonly projectRoot: string;
	private readonly options: BuildOptions;

	constructor(projectRoot: string, options: BuildOptions) {
		this.projectRoot = projectRoot;
		this.options = options;
	}

	/**
	 * Initialize webpack by loading it from the project's node_modules
	 */
	private async initialize(): Promise<void> {
		if (this.webpack) {
			return;
		}

		// Load webpack from project's node_modules
		const webpackPath = path.join(this.projectRoot, 'node_modules', 'webpack');

		if (!fs.existsSync(webpackPath)) {
			throw new Error(
				'webpack not found in project. Make sure webpack is installed: npm install webpack',
			);
		}

		try {
			// Use createRequire to load webpack (CommonJS module) from the project
			const require = createRequire(
				path.join(this.projectRoot, 'package.json'),
			);
			this.webpack = require('webpack') as WebpackModule;
		} catch (error) {
			throw new Error(
				`Failed to load webpack: ${error instanceof Error ? error.message : String(error)}`,
			);
		}

		// Load webpack config from project
		await this.loadConfig();
	}

	/**
	 * Load webpack configuration from the project
	 */
	private async loadConfig(): Promise<void> {
		// Only project-local webpack configs are consumed in-process. Projects
		// without one are built by delegating to @sitevision/sitevision-scripts
		// (see sitevision-scripts-runner), so there is no config fallback here.
		const configPath = findLocalWebpackConfig(this.projectRoot);

		if (!configPath) {
			throw new Error(
				'webpack.config.js not found. Make sure your project has a webpack configuration.',
			);
		}

		try {
			const configModule = await import(configPath);
			const configFactory: WebpackConfigFactory =
				configModule.default || configModule;

			// If it's a function, call it with options
			if (typeof configFactory === 'function') {
				this.config = configFactory({
					dev: this.options.mode === 'development',
					cssPrefix: this.options.cssPrefix || '',
					restApp: this.options.restApp || false,
				});
			} else {
				this.config = configFactory as unknown as WebpackConfig;
			}

			// Override mode
			this.config.mode =
				this.options.mode === 'development' ? 'development' : 'production';
		} catch (error) {
			throw new Error(
				`Failed to load webpack config: ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	}

	/**
	 * Convert webpack stats to BuildResult
	 */
	private statsToResult(stats: WebpackStats): BuildResult {
		const json = stats.toJson();

		return {
			success: !stats.hasErrors(),
			outputPath: this.config?.output?.path,
			errors: json.errors?.map(e => e.message) || [],
			warnings: json.warnings?.map(w => w.message) || [],
			stats: {
				time: json.time || 0,
				hash: json.hash || '',
				assets: json.assets?.map(a => a.name) || [],
			},
		};
	}

	/**
	 * Run a single webpack build
	 */
	async run(): Promise<BuildResult> {
		await this.initialize();

		if (!this.webpack || !this.config) {
			throw new Error('Webpack not initialized');
		}

		return new Promise((resolve, reject) => {
			this.compiler = this.webpack!(this.config!);
			this.compiler.run((err, stats) => {
				if (err) {
					reject(err);
					return;
				}

				if (!stats) {
					const error = new Error('No stats returned from webpack');
					reject(error);
					return;
				}

				const result = this.statsToResult(stats);

				// Copy chunks to resources if build succeeded
				if (result.success && this.config?.output?.path) {
					try {
						copyChunksToResources(this.config.output.path);
					} catch (chunkError) {
						// Non-fatal, just log
						console.warn('Warning: Failed to copy chunks:', chunkError);
					}
				}

				resolve(result);
			});
		});
	}

	/**
	 * Start webpack in watch mode
	 *
	 * @param callback - Called after each compilation
	 */
	async watch(callback?: (result: BuildResult) => void): Promise<void> {
		await this.initialize();

		if (!this.webpack || !this.config) {
			throw new Error('Webpack not initialized');
		}

		return new Promise(resolve => {
			this.compiler = this.webpack!(this.config!);

			this.watcher = this.compiler.watch(
				{
					aggregateTimeout: 300,
					ignored: ['**/dist/**', '**/build/**', '**/node_modules/**'],
				},
				(err, stats) => {
					if (err) {
						callback?.({
							success: false,
							errors: [err.message],
						});
						return;
					}

					if (!stats) {
						return;
					}

					const result = this.statsToResult(stats);

					// Copy chunks to resources if build succeeded
					if (result.success && this.config?.output?.path) {
						try {
							copyChunksToResources(this.config.output.path);
						} catch (chunkError) {
							console.warn('Warning: Failed to copy chunks:', chunkError);
						}
					}

					callback?.(result);
				},
			);

			// Resolve immediately - watch continues in background
			resolve();
		});
	}

	/**
	 * Stop watching and close the compiler
	 */
	async close(): Promise<void> {
		return new Promise(resolve => {
			if (this.watcher) {
				this.watcher.close(() => {
					this.watcher = null;
					this.compiler = null;
					resolve();
				});
			} else if (this.compiler) {
				this.compiler.close(() => {
					this.compiler = null;
					resolve();
				});
			} else {
				resolve();
			}
		});
	}

	/**
	 * Check if webpack is available in the project
	 */
	static isWebpackAvailable(projectRoot: string): boolean {
		const webpackPath = path.join(projectRoot, 'node_modules', 'webpack');
		return fs.existsSync(webpackPath);
	}

	/**
	 * Get the webpack version from the project
	 */
	static getWebpackVersion(projectRoot: string): string | null {
		try {
			const packageJsonPath = path.join(
				projectRoot,
				'node_modules',
				'webpack',
				'package.json',
			);
			if (fs.existsSync(packageJsonPath)) {
				const packageJson = JSON.parse(
					fs.readFileSync(packageJsonPath, 'utf-8'),
				);
				return packageJson.version;
			}
		} catch {
			// Ignore errors
		}

		return null;
	}
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Run a single webpack build
 *
 * @param projectRoot - Project root directory
 * @param options - Build options
 * @returns Build result
 */
export async function runWebpackBuild(
	projectRoot: string,
	options: BuildOptions,
): Promise<BuildResult> {
	const runner = new WebpackRunner(projectRoot, options);
	return runner.run();
}

/**
 * Start webpack in watch mode
 *
 * @param projectRoot - Project root directory
 * @param options - Build options
 * @param callback - Called after each compilation
 * @returns WebpackRunner instance (call .close() to stop)
 */
export async function startWebpackWatch(
	projectRoot: string,
	options: BuildOptions,
	callback?: (result: BuildResult) => void,
): Promise<WebpackRunner> {
	const runner = new WebpackRunner(projectRoot, options);
	await runner.watch(callback);
	return runner;
}
