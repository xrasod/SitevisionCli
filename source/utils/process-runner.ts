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
	private readonly command: string;
	private readonly args: string[];
	private readonly cwd?: string;
	private readonly interactive: boolean;
	private readonly customEnv?: Record<string, string>;

	constructor(
		command: string,
		args: string[] = [],
		cwd?: string,
		interactive = false,
		customEnv?: Record<string, string>,
	) {
		super();
		this.command = command;
		this.args = args;
		this.cwd = cwd;
		this.interactive = interactive;
		this.customEnv = customEnv;
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
