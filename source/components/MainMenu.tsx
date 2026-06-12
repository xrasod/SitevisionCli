import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {type ProjectInfo, getAppType} from '../utils/project-detection.js';
import {resolveLocalizedString} from '../types/index.js';

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
			label: '✍️  Sign',
			value: 'sign',
			description: 'Sign the app for production deployment',
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
			<Box marginBottom={1}>
				<Text bold color="cyan">Sitevision Project Information</Text>
			</Box>

			<Box flexDirection="column" marginLeft={2} marginBottom={1}>
				<Box>
					<Text bold>Name: </Text>
					<Text>{resolveLocalizedString(project.manifest.name)}</Text>
				</Box>
				<Box>
					<Text bold>ID: </Text>
					<Text>{project.manifest.id}</Text>
				</Box>
				<Box>
					<Text bold>Version: </Text>
					<Text>{project.manifest.version}</Text>
				</Box>
				<Box>
					<Text bold>Type: </Text>
					<Text color="green">{project.manifest.type}</Text>
					<Text dimColor> ({appType})</Text>
				</Box>
				<Box>
					<Text bold>Bundled: </Text>
					<Text>{project.manifest.bundled ? 'Yes' : 'No'}</Text>
				</Box>
			</Box>

			{project.hasDevProperties && project.devProperties && (
				<>
					<Box marginBottom={1}>
						<Text bold color="cyan">Development Configuration</Text>
					</Box>

					<Box flexDirection="column" marginLeft={2} marginBottom={1}>
						<Box>
							<Text bold>Domain: </Text>
							<Text>{project.devProperties.domain}</Text>
						</Box>
						<Box>
							<Text bold>Site: </Text>
							<Text>{project.devProperties.siteName}</Text>
						</Box>
						<Box>
							<Text bold>Addon: </Text>
							<Text>{project.devProperties.addonName}</Text>
						</Box>
						<Box>
							<Text bold>Username: </Text>
							<Text>{project.devProperties.username}</Text>
						</Box>
						<Box>
							<Text bold>Use HTTP: </Text>
							<Text>{project.devProperties.useHTTPForDevDeploy ? 'Yes' : 'No'}</Text>
						</Box>
					</Box>
				</>
			)}

			{project.hasSigningProperties && project.devProperties && (
				<>
					<Box marginBottom={1}>
						<Text bold color="cyan">Signing Configuration</Text>
					</Box>

					<Box flexDirection="column" marginLeft={2} marginBottom={1}>
						<Box>
							<Text bold>Signing User: </Text>
							<Text>{project.devProperties.signingUsername}</Text>
						</Box>
						{project.devProperties.certificateName && (
							<Box>
								<Text bold>Certificate: </Text>
								<Text>{project.devProperties.certificateName}</Text>
							</Box>
						)}
					</Box>
				</>
			)}

			{!project.hasDevProperties && (
				<Box marginBottom={1} paddingX={1} borderStyle="round" borderColor="yellow">
					<Text color="yellow">
						⚠ No dev properties found. Some commands may not work.
					</Text>
				</Box>
			)}

			{project.hasDevProperties && !project.hasSigningProperties && (
				<Box marginBottom={1} paddingX={1} borderStyle="round" borderColor="yellow">
					<Text color="yellow">
						⚠ No signing credentials configured. Run svc setup-signing to configure.
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
