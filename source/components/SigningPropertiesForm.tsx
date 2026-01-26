import React, {useState} from 'react';
import {Box, Text} from 'ink';
import {TextInput} from './TextInput.js';
import type {DevProperties} from '../types/index.js';
import {writeDevProperties, readDevProperties} from '../utils/project-detection.js';

interface Props {
	projectRoot: string;
	onComplete: () => void;
	onCancel: () => void;
}

type Step = 'username' | 'certificate';

const STEPS: {id: Step; label: string}[] = [
	{id: 'username', label: 'Signing Username'},
	{id: 'certificate', label: 'Certificate Name'},
];

export function SigningPropertiesForm({projectRoot, onComplete, onCancel}: Props) {
	const [stepIndex, setStepIndex] = useState(0);
	// Read existing properties to preserve other fields
	const [properties, setProperties] = useState<DevProperties>(() => readDevProperties(projectRoot) || {} as DevProperties);

	const currentStep = STEPS[stepIndex];

	const handleNext = (key: keyof DevProperties, value: any) => {
		const newProperties = {...properties, [key]: value};
		setProperties(newProperties);

		if (stepIndex < STEPS.length - 1) {
			setStepIndex(stepIndex + 1);
		} else {
			// Save and finish
			writeDevProperties(projectRoot, newProperties);
			onComplete();
		}
	};

	const renderInput = () => {
		switch (currentStep?.id) {
			case 'username':
				return (
					<TextInput
						key="username"
						label="Signing Username (developer.sitevision.se)"
						defaultValue={properties.signingUsername}
						onSubmit={(value: string) => handleNext('signingUsername', value)}
						onCancel={onCancel}
					/>
				);
			case 'certificate':
				return (
					<TextInput
						key="certificate"
						label="Certificate Name (Optional)"
						defaultValue={properties.certificateName}
						placeholder="Leave empty for default"
						onSubmit={(value: string) => handleNext('certificateName', value)}
						onCancel={onCancel}
					/>
				);
			default:
				return null;
		}
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold color="cyan">Setup Signing Properties</Text>
				<Text> Step {stepIndex + 1} of {STEPS.length}: {currentStep?.label}</Text>
			</Box>

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
