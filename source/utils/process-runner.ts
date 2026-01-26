import {spawn, type ChildProcess} from 'child_process';
import {EventEmitter} from 'events';

export interface ProcessOutput {
	type: 'stdout' | 'stderr';
	data: string;
}

export interface ProcessResult {
	exitCode: number;
	output: ProcessOutput[];
}

export class ProcessRunner extends EventEmitter {
	private process: ChildProcess | null = null;
	private output: ProcessOutput[] = [];

	constructor(
		private command: string,
		private args: string[] = [],
		private cwd?: string,
		private interactive: boolean = false,
		private customEnv?: Record<string, string>,
	) {
		super();
	}

	run(): Promise<ProcessResult> {
		return new Promise((resolve, reject) => {
			this.process = spawn(this.command, this.args, {
				cwd: this.cwd || process.cwd(),
				env: {...process.env, ...this.customEnv},
				shell: true,
				stdio: this.interactive ? 'inherit' : 'pipe',
			});

			// Only capture output if not in interactive mode
			if (!this.interactive) {
				this.process.stdout?.on('data', data => {
					const output: ProcessOutput = {
						type: 'stdout',
						data: data.toString(),
					};
					this.output.push(output);
					if (this.output.length > 1000) {
						this.output.shift();
					}
					this.emit('output', output);
				});

				this.process.stderr?.on('data', data => {
					const output: ProcessOutput = {
						type: 'stderr',
						data: data.toString(),
					};
					this.output.push(output);
					if (this.output.length > 1000) {
						this.output.shift();
					}
					this.emit('output', output);
				});
			}

			this.process.on('error', error => {
				this.emit('error', error);
				reject(error);
			});

			this.process.on('close', code => {
				const exitCode = code ?? 0;
				this.emit('exit', exitCode);

				resolve({
					exitCode,
					output: this.output,
				});
			});
		});
	}

	kill(): void {
		if (this.process) {
			this.process.kill('SIGTERM');
		}
	}

	getOutput(): ProcessOutput[] {
		return this.output;
	}
}

/**
 * Run a sitevision-scripts command in the project directory
 */
export function runSitevisionScript(
	scriptName: string,
	args: string[] = [],
	projectRoot?: string,
): ProcessRunner {
	// Check if sitevision-scripts is available locally
	const runner = new ProcessRunner(
		'npm',
		['run', scriptName, '--', ...args],
		projectRoot,
	);

	return runner;
}

/**
 * Run an NPM script
 */
export function runNpmScript(
	scriptName: string,
	args: string[] = [],
	projectRoot?: string,
	customEnv?: Record<string, string>,
): ProcessRunner {
	const runner = new ProcessRunner(
		'npm',
		['run', scriptName, ...args],
		projectRoot,
		false,
		customEnv,
	);
	return runner;
}
