import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {type ProjectInfo} from '../utils/project-detection.js';
import {getAppType} from '../utils/project-detection.js';

interface MenuItem {
	label: string;
	value: string;
	description?: string;
}

interface Props {
	project: ProjectInfo;
	onSelect: (command: string) => void;
}

export function MainMenu({project, onSelect}: Props) {
	const appType = getAppType(project.manifest);
	const [selectedIndex, setSelectedIndex] = useState(0);

	const items: MenuItem[] = [
		{
			label: '🚀 Dev',
			value: 'dev',
			description: 'Start development server with watch mode',
		},
		{
			label: '🔐 Dev (Signed)',
			value: 'dev-signed',
			description: 'Development with automatic signing',
		},
		{
			label: '🔨 Build',
			value: 'build',
			description: 'Build the application for production',
		},
		{
			label: '📦 Deploy',
			value: 'deploy',
			description: 'Deploy to development server',
		},
		{
			label: '🚢 Deploy (Force)',
			value: 'deploy-force',
			description: 'Force deploy (overwrite existing)',
		},
		{
			label: '🌍 Deploy Production',
			value: 'deploy-production',
			description: 'Deploy to production server',
		},
		{
			label: 'ℹ️  Info',
			value: 'info',
			description: 'Show project information',
		},
		{
			label: '❌ Exit',
			value: 'exit',
			description: 'Exit the CLI',
		},
	];

	useInput((input, key) => {
		if (key.upArrow) {
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
		}

		if (key.downArrow) {
			setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
		}

		if (key.return || input === '\r' || input === '\n') {
			const selectedItem = items[selectedIndex];
			if (!selectedItem) return;

			if (selectedItem.value === 'exit') {
				process.exit(0);
			}
			onSelect(selectedItem.value);
		}
	});

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1} flexDirection="column">
				<Text bold color="cyan">
					Sitevision CLI
				</Text>
				<Text dimColor>
					{project.manifest.name} ({project.manifest.type} - {appType})
				</Text>
			</Box>

			{!project.hasDevProperties && (
				<Box marginBottom={1} paddingX={1} borderStyle="round" borderColor="yellow">
					<Text color="yellow">
						⚠ No dev properties found. Some commands may not work.
					</Text>
				</Box>
			)}

			<Box marginBottom={1}>
				<Text dimColor>Select a command:</Text>
			</Box>

			<Box flexDirection="column">
				{items.map((item, index) => (
					<Box key={item.value} marginLeft={1}>
						<Text color={index === selectedIndex ? 'cyan' : undefined} bold={index === selectedIndex}>
							{index === selectedIndex ? '▶ ' : '  '}
							{item.label}
							{item.description && (
								<Text dimColor> - {item.description}</Text>
							)}
						</Text>
					</Box>
				))}
			</Box>

			<Box marginTop={1}>
				<Text dimColor>Use ↑↓ arrows to navigate, Enter to select</Text>
			</Box>
		</Box>
	);
}
