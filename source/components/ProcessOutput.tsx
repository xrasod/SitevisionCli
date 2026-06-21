import {useState, useEffect} from 'react';
import {Box, Text} from 'ink';
import {ProcessRunner, type ProcessOutput} from '../utils/process-runner.js';

interface Props {
	runner: ProcessRunner;
}

export function ProcessOutputComponent({runner}: Props) {
	const [outputs, setOutputs] = useState<ProcessOutput[]>([]);
	const [isRunning, setIsRunning] = useState(true);
	const [exitCode, setExitCode] = useState<number | null>(null);

	useEffect(() => {
		const handleOutput = (output: ProcessOutput) => {
			setOutputs(prev => {
				const newOutputs = [...prev, output];
				if (newOutputs.length > 100) {
					return newOutputs.slice(newOutputs.length - 100);
				}
				return newOutputs;
			});
		};

		const handleExit = (code: number) => {
			setIsRunning(false);
			setExitCode(code);
		};

		runner.on('output', handleOutput);
		runner.on('exit', handleExit);

		return () => {
			runner.off('output', handleOutput);
			runner.off('exit', handleExit);
		};
	}, [runner]);

	return (
		<Box flexDirection="column">
			{outputs.map((output, index) => (
				<Text
					key={index}
					color={output.type === 'stderr' ? 'red' : undefined}
					dimColor={output.type === 'stderr'}
				>
					{output.data}
				</Text>
			))}
			{!isRunning && exitCode !== null && (
				<Box marginTop={1}>
					<Text color={exitCode === 0 ? 'green' : 'red'}>
						{exitCode === 0 ? '✓ Success' : `✗ Failed with code ${exitCode}`}
					</Text>
				</Box>
			)}
		</Box>
	);
}
