import {
	spawn,
	spawnSync,
	type ChildProcess,
	type SpawnOptions,
} from 'child_process';
import {EventEmitter} from 'events';

export interface ProcessOutput {
	type: 'stdout' | 'stderr';
	data: string;
}

export interface ProcessResult {
	exitCode: number;
	output: ProcessOutput[];
}

const children = new Set<ChildProcess>();

/**
 * Spawn a child in its own process group, so stopping it also stops whatever it
 * starts (npm, webpack workers), and track it so the CLI can kill leftovers on
 * exit.
 */
export function spawnChild(
	command: string,
	args: string[],
	options: SpawnOptions = {},
): ChildProcess {
	const child = spawn(command, args, {
		...options,
		detached: process.platform !== 'win32',
	});
	children.add(child);
	const forget = () => children.delete(child);
	child.on('close', forget);
	child.on('error', forget);
	return child;
}

/** Stop a child and everything it started. */
export function killChild(child: ChildProcess): void {
	if (
		child.pid === undefined ||
		child.exitCode !== null ||
		child.signalCode !== null
	) {
		return;
	}

	try {
		if (process.platform === 'win32') {
			// No process groups on Windows: taskkill /T takes the whole tree.
			spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
				stdio: 'ignore',
				windowsHide: true,
			});
		} else {
			process.kill(-child.pid, 'SIGTERM');
		}
	} catch {
		// Already gone.
	}
}

/** Kill every child still running; returns how many were signalled. */
export function killAllChildren(): number {
	const running = [...children];
	for (const child of running) killChild(child);
	return running.length;
}

export class ProcessRunner extends EventEmitter {
	private process: ChildProcess | null = null;
	private readonly output: ProcessOutput[] = [];
	private readonly command: string;
	private readonly args: string[];
	private readonly cwd?: string;

	constructor(command: string, args: string[] = [], cwd?: string) {
		super();
		this.command = command;
		this.args = args;
		this.cwd = cwd;
	}

	run(): Promise<ProcessResult> {
		return new Promise((resolve, reject) => {
			this.process = spawnChild(this.command, this.args, {
				cwd: this.cwd || process.cwd(),
				shell: true,
				stdio: 'pipe',
			});

			const capture = (type: ProcessOutput['type']) => (data: Buffer) => {
				const output: ProcessOutput = {type, data: data.toString()};
				this.output.push(output);
				if (this.output.length > 1000) {
					this.output.shift();
				}

				this.emit('output', output);
			};

			this.process.stdout?.on('data', capture('stdout'));
			this.process.stderr?.on('data', capture('stderr'));

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
		if (this.process) killChild(this.process);
	}

	getOutput(): ProcessOutput[] {
		return this.output;
	}
}
