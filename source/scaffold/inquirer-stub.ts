/**
 * Stands in for inquirer inside the scaffolder: every question goes to svc over
 * the socket in SVC_PROMPT_SOCKET and the reply comes back as the answer. `when`,
 * `filter`, `validate` and function-valued fields run here, where they live.
 * Self-contained on purpose: it is loaded by the tool's node, not by svc.
 */
import net from 'node:net';
import process from 'node:process';
import readline from 'node:readline';

type Answers = Record<string, unknown>;
type Question = Record<string, unknown> & {name: string};
type Choice = {name: string; value: unknown; checked: boolean};
type Reply = {value?: unknown; skip?: boolean};

const CHOICE_TYPES = new Set(['list', 'rawlist', 'expand', 'select', 'search']);

const evaluate = async (field: unknown, ...args: unknown[]) =>
	typeof field === 'function' ? ((await field(...args)) as unknown) : field;

const text = (value: unknown) =>
	typeof value === 'string' ? value : JSON.stringify(value);

function normalizeChoices(raw: unknown): Choice[] {
	if (!Array.isArray(raw)) return [];
	const choices: Choice[] = [];
	for (const entry of raw as unknown[]) {
		if (entry === null || typeof entry !== 'object') {
			choices.push({name: text(entry), value: entry, checked: false});
			continue;
		}

		const choice = entry as Record<string, unknown>;
		if (choice['type'] === 'separator' || choice['disabled']) continue;
		const value = 'value' in choice ? choice['value'] : choice['name'];
		choices.push({
			name: text(choice['name'] ?? value),
			value,
			checked: Boolean(choice['checked']),
		});
	}

	return choices;
}

/** Ask svc until the tool's own validation accepts; undefined when skipped. */
async function askOne(
	question: Question,
	answers: Answers,
	exchange: (message: Record<string, unknown>) => Promise<Reply>,
): Promise<unknown> {
	const type = text(question['type'] ?? 'input');
	const choices = normalizeChoices(
		await evaluate(question['choices'], answers),
	);
	const fallback = await evaluate(question['default'], answers);
	const values = choices.map(choice => choice.value);
	const message = text(await evaluate(question['message'], answers));

	let initial = fallback;
	if (type === 'checkbox') {
		const preset = Array.isArray(fallback) ? (fallback as unknown[]) : [];
		initial = choices.flatMap((choice, i) =>
			choice.checked || preset.includes(choice.value) ? [i] : [],
		);
	} else if (CHOICE_TYPES.has(type)) {
		// Inquirer takes a default as either the value or its index.
		const at = values.indexOf(fallback);
		initial = at === -1 && typeof fallback === 'number' ? fallback : at;
		initial = Math.max(0, initial as number);
	}

	let error: string | undefined;
	for (;;) {
		// eslint-disable-next-line no-await-in-loop
		const reply = await exchange({
			name: question.name,
			type,
			message,
			choices: choices.map(choice => choice.name),
			default: initial,
			error,
		});
		if (reply.skip) return undefined;

		let {value} = reply;
		if (type === 'checkbox') value = (value as number[]).map(i => values[i]);
		else if (CHOICE_TYPES.has(type)) value = values[value as number];
		else if (type === 'number') value = Number(value);

		// eslint-disable-next-line no-await-in-loop
		value = await evaluate(question['filter'] ?? value, value, answers);
		// eslint-disable-next-line no-await-in-loop
		const valid = await evaluate(question['validate'] ?? true, value, answers);
		if (valid === true) return value;
		error = typeof valid === 'string' ? valid : 'Invalid value';
	}
}

async function prompt(
	questions: unknown,
	initial: Answers = {},
): Promise<Answers> {
	const list: Question[] = Array.isArray(questions)
		? (questions as Question[])
		: typeof (questions as Question).name === 'string'
			? [questions as Question]
			: Object.entries(questions as Record<string, Question>).map(
					([name, question]) => ({...question, name}),
				);
	const socket = net.connect(process.env['SVC_PROMPT_SOCKET']!);
	const lines = readline.createInterface({input: socket});
	const replies = lines[Symbol.asyncIterator]();
	const exchange = async (message: Record<string, unknown>) => {
		socket.write(JSON.stringify(message) + '\n');
		const next = await replies.next();
		if (next.done) throw new Error('svc closed the prompt');
		return JSON.parse(next.value) as Reply;
	};

	// ponytail: dotted names ("a.b") stay flat keys; nest them if a question ever uses one.
	const answers: Answers = {...initial};
	try {
		for (const question of list) {
			const wanted =
				question['when'] === undefined ||
				// eslint-disable-next-line no-await-in-loop
				Boolean(await evaluate(question['when'], answers));
			const answered =
				answers[question.name] !== undefined && !question['askAnswered'];
			if (!wanted || answered) continue;
			// eslint-disable-next-line no-await-in-loop
			const value = await askOne(question, answers, exchange);
			if (value !== undefined) answers[question.name] = value;
		}
	} finally {
		socket.end();
	}

	return answers;
}

const inquirer = {prompt};
export default inquirer;
