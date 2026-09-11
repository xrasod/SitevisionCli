import type {
	DevProperties,
	EnvironmentOverride,
	ProjectInfo,
} from '../types/index.js';
import {resolveRuntimeSecrets} from './project-detection.js';

/** Name of the environment the top-level dev properties describe. */
export function baseEnvironment(dev?: Partial<DevProperties>): string {
	return dev?.baseEnvironment?.trim() || 'dev';
}

export function environmentNames(dev?: Partial<DevProperties>): string[] {
	const base = baseEnvironment(dev);
	return [
		base,
		...Object.keys(dev?.environments ?? {}).filter(name => name !== base),
	];
}

export function isProductionEnvironment(
	name: string,
	dev?: Partial<DevProperties>,
): boolean {
	if (name === baseEnvironment(dev)) return dev?.production ?? false;
	return dev?.environments?.[name]?.production ?? /prod/i.test(name);
}

/** Badge colour: dev green, production red, anything else yellow. */
export function environmentColor(
	name: string,
	dev?: Partial<DevProperties>,
): 'green' | 'yellow' | 'red' {
	if (isProductionEnvironment(name, dev)) return 'red';
	return name === baseEnvironment(dev) ? 'green' : 'yellow';
}

/**
 * The effective dev properties for one environment: the base with that
 * environment's overrides applied and credentials resolved for its
 * domain/username. The base ("dev") is returned as-is.
 */
export function resolveEnvironment(
	dev: DevProperties,
	name: string,
): DevProperties {
	const production = isProductionEnvironment(name, dev);
	if (name === baseEnvironment(dev)) {
		return {...dev, environmentName: name, productionEnvironment: production};
	}

	const override: EnvironmentOverride = dev.environments?.[name] ?? {};
	const {production: _production, ...fields} = override;
	const resolved: DevProperties = {
		...dev,
		...fields,
		password: undefined,
		accessToken: undefined,
		sessionCookie: undefined,
		environmentName: name,
		productionEnvironment: production,
	};
	return resolveRuntimeSecrets(resolved);
}

/** A project view whose dev properties are resolved for `name`. */
export function environmentProject(
	project: ProjectInfo,
	name: string,
): ProjectInfo {
	if (!project.devProperties) return project;
	return {
		...project,
		devProperties: resolveEnvironment(project.devProperties, name),
	};
}

/**
 * Write one environment's override into the base: keep only the keys whose
 * value differs from the base, so the file stays minimal.
 */
export function withEnvironmentOverride(
	base: DevProperties,
	name: string,
	values: EnvironmentOverride,
): DevProperties {
	const current: Record<string, unknown> = {...base.environments?.[name]};
	const changed = Object.fromEntries(
		Object.entries(values).map(([key, value]) => {
			const baseValue = (base as unknown as Record<string, unknown>)[key];
			const same =
				value === undefined ||
				value === '' ||
				JSON.stringify(value) === JSON.stringify(baseValue);
			return [key, same ? undefined : value];
		}),
	);
	const override = Object.fromEntries(
		Object.entries({...current, ...changed}).filter(
			([, value]) => value !== undefined,
		),
	);

	return {
		...base,
		environments: {...base.environments, [name]: override},
	};
}
