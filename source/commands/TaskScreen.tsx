import {useEffect, useRef, type ReactNode} from 'react';
import {styleText} from 'node:util';
import {Box, useStdout} from 'ink';
import {StatusIndicator} from '../components/StatusIndicator.js';
import {useTasks, type LogLine, type Task} from '../utils/tasks.js';
import {useFinish} from './use-finish.js';

interface Props {
	task: Task;
	// Keep the screen up after a failure, for a retry key.
	stay?: boolean;
	children?: ReactNode;
}

const LEVEL_STYLE: Record<
	LogLine['level'],
	'reset' | 'green' | 'yellow' | 'red'
> = {info: 'reset', ok: 'green', warn: 'yellow', error: 'red'};

/**
 * A one-shot command: the task's log printed above the status as it comes (a
 * terminal keeps it in scrollback, CI keeps all of it), then exit with its result.
 */
export function TaskScreen({task, stay = false, children}: Props) {
	const {write} = useStdout();
	const live = useTasks().find(t => t.id === task.id) ?? task;
	const result =
		live.status === 'running'
			? undefined
			: live.status === 'success'
				? 'success'
				: 'error';

	// ponytail: counts lines, so past the task's 2000-line cap (where old lines
	// are dropped) some would be skipped. No one-shot command logs that much.
	const printed = useRef(0);
	useEffect(() => {
		for (const line of live.lines.slice(printed.current)) {
			write(
				`${styleText('dim', line.tag.padEnd(3))} ${styleText(LEVEL_STYLE[line.level], line.text)}\n`,
			);
		}

		printed.current = live.lines.length;
	});

	useFinish(result, stay && result === 'error');

	return (
		<Box flexDirection="column" paddingX={1} marginTop={1}>
			<StatusIndicator
				status={result ?? 'running'}
				label={live.phase}
				message={`${live.label} ${live.appName}`}
			/>
			{children}
		</Box>
	);
}
