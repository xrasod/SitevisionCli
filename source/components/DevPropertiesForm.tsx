import React, {useState} from 'react';
import {Box, Text, useInput} from 'ink';
import {TextInput} from './TextInput.js';
import type {DevProperties, PackageJson} from '../types/index.js';
import {writeDevProperties} from '../utils/project-detection.js';

interface Props {
	projectRoot: string;
	initialProperties?: DevProperties;
	packageJson: PackageJson;
	onComplete: () => void;
	onCancel: () => void;
}

type Step = 'domain' | 'siteName' | 'addonName' | 'username' | 'password' | 'useHTTP';

const STEPS: {id: Step; label: string}[] = [
	{id: 'domain', label: 'Domain'},
	{id: 'siteName', label: 'Site Name'},
	{id: 'addonName', label: 'Addon Name'},
	{id: 'username', label: 'Username'},
	{id: 'password', label: 'Password'},
	{id: 'useHTTP', label: 'Use HTTP'},
];

export function DevPropertiesForm({projectRoot, initialProperties, packageJson, onComplete, onCancel}: Props) {
	const [stepIndex, setStepIndex] = useState(0);
	const [properties, setProperties] = useState<Partial<DevProperties>>(() => {
		const defaults = {
			domain: packageJson.developmentDomain || '',
			addonName: packageJson.addonName || '',
			siteName: packageJson.siteName || '',
		};
		return {...defaults, ...initialProperties};
	});

	const currentStep = STEPS[stepIndex];

	const handleNext = (key: keyof DevProperties, value: any) => {
		const newProperties = {...properties, [key]: value};
		setProperties(newProperties);

		if (stepIndex < STEPS.length - 1) {
			setStepIndex(stepIndex + 1);
		} else {
			// Save and finish
			writeDevProperties(projectRoot, newProperties as DevProperties);
			onComplete();
		}
	};

	const renderInput = () => {
		switch (currentStep?.id) {
			case 'domain':
				return (
					<TextInput
						key="domain"
						label="Development Domain (e.g. www.sitevision.se)"
						defaultValue={properties.domain}
						placeholder="sitevision.se"
						onSubmit={(value: string) => handleNext('domain', value)}
						onCancel={onCancel}
					/>
				);
			case 'siteName':
				return (
					<TextInput
						key="siteName"
						label="Site Name (Root node name)"
						defaultValue={properties.siteName}
						onSubmit={(value: string) => handleNext('siteName', value)}
						onCancel={onCancel}
					/>
				);
			case 'addonName':
				return (
					<TextInput
						key="addonName"
						label="Addon Name"
						defaultValue={properties.addonName}
						onSubmit={(value: string) => handleNext('addonName', value)}
						onCancel={onCancel}
					/>
				);
			case 'username':
				return (
					<TextInput
						key="username"
						label="Username (usually your Sitevision Cloud email)"
						defaultValue={properties.username}
						onSubmit={(value: string) => handleNext('username', value)}
						onCancel={onCancel}
					/>
				);
			case 'password':
				return (
					<TextInput
						key="password"
						label="Password (Optional - leave empty to prompt on each run)"
						type="password"
						defaultValue={properties.password}
						onSubmit={(value: string) => handleNext('password', value)}
						onCancel={onCancel}
					/>
				);
			case 'useHTTP':
				return (
					<BooleanInput
						key="useHTTP"
						label="Use HTTP for deployment? (y/n)"
						defaultValue={properties.useHTTPForDevDeploy}
						onSubmit={(value: boolean) => handleNext('useHTTPForDevDeploy', value)}
					/>
				);
			default:
				return null;
		}
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="cyan">Setup Development Properties</Text>
				<Text> Step {stepIndex + 1} of {STEPS.length}: {currentStep?.label}</Text>
			</Box>

			{/* Progress Bar */}
			<Box marginBottom={1}>
				{STEPS.map((s, i) => (
					<Box key={s.id} marginRight={1}>
						<Text color={i === stepIndex ? 'green' : i < stepIndex ? 'green' : 'gray'}>
							{i < stepIndex ? '✓' : i === stepIndex ? '●' : '○'}
						</Text>
					</Box>
				))}
			</Box>

			<Box borderStyle="single" borderColor="gray" padding={1}>
				{renderInput()}
			</Box>
		</Box>
	);
}

function BooleanInput({label, defaultValue, onSubmit}: {label: string, defaultValue?: boolean, onSubmit: (val: boolean) => void}) {
	useInput((input) => {
		if (input === 'y' || input === 'Y') {
			onSubmit(true);
		} else if (input === 'n' || input === 'N') {
			onSubmit(false);
		} else if (input === '\r' && defaultValue !== undefined) {
			onSubmit(defaultValue);
		}
	});

	return (
		<Box flexDirection="column">
			<Box marginBottom={1}>
				<Text bold color="cyan">{label}</Text>
			</Box>
			<Box>
				<Text dimColor>Press Y for Yes, N for No{defaultValue !== undefined ? ` (Default: ${defaultValue ? 'Yes' : 'No'})` : ''}</Text>
			</Box>
		</Box>
	);
}
