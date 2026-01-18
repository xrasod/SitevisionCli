import React from 'react';
import {Box, Text} from 'ink';
import Spinner from 'ink-spinner';

export type Status = 'pending' | 'running' | 'success' | 'error';

interface Props {
	status: Status;
	label: string;
	message?: string;
}

export function StatusIndicator({status, label, message}: Props) {
	const getIcon = () => {
		switch (status) {
			case 'pending':
				return <Text dimColor>○</Text>;
			case 'running':
				return (
					<Text color="cyan">
						<Spinner type="dots" />
					</Text>
				);
			case 'success':
				return <Text color="green">✓</Text>;
			case 'error':
				return <Text color="red">✗</Text>;
		}
	};

	const getColor = () => {
		switch (status) {
			case 'pending':
				return 'gray';
			case 'running':
				return 'cyan';
			case 'success':
				return 'green';
			case 'error':
				return 'red';
		}
	};

	return (
		<Box>
			{getIcon()}
			<Box marginLeft={1}>
				<Text color={getColor()} bold>
					{label}
				</Text>
			</Box>
			{message && (
				<Box marginLeft={1}>
					<Text dimColor>{message}</Text>
				</Box>
			)}
		</Box>
	);
}
