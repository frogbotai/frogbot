/** How a rule compares the answer to an earlier question. */
export type FormRuleOperator = 'equals' | 'hasValue' | 'notEquals';

/** Shows a question when the answer to an earlier question passes the check. */
export type FormRule = {
  /** The key of an earlier, non-file question. */
  question: string;
  operator: FormRuleOperator;
  /** What `equals` and `notEquals` compare with. A checkbox answer is `'true'` or `'false'`. */
  value?: string;
};

/** Whether every rule must pass (`all`, the default) or one is enough (`any`). */
export type FormRuleMatch = 'all' | 'any';

/** What the evaluator reads from a question: its key and type, and its rules if it has any. */
export type RuleQuestion = {
  key: string;
  type?: string;
  rules?: FormRule[];
  match?: FormRuleMatch;
};

export const RULE_OPERATORS: readonly FormRuleOperator[] = ['equals', 'notEquals', 'hasValue'];

function present(answer: unknown): boolean {
  if (answer === undefined || answer === null || answer === false) return false;
  if (Array.isArray(answer)) return answer.length > 0;

  return typeof answer !== 'string' || answer.trim() !== '';
}

function same(answer: unknown, value: string, type: string | undefined): boolean {
  if (type === 'number') {
    const number = typeof answer === 'string' && answer.trim() ? Number(answer) : answer;

    return typeof number === 'number' && value.trim() !== '' && number === Number(value);
  }

  return (
    (typeof answer === 'string' || typeof answer === 'number' || typeof answer === 'boolean') &&
    String(answer) === value
  );
}

function equals(answer: unknown, value: string, type: string | undefined): boolean {
  if (Array.isArray(answer)) return answer.some((item) => same(item, value, type));

  return same(answer, value, type);
}

/**
 * The keys of the questions shown for `answers`. Questions are read in order, and the answer to a
 * hidden, later or unknown question counts as unanswered, so chained rules resolve the same way in
 * the page, the builder preview and on the server. Pure and client-safe.
 */
export function visibleQuestions(
  steps: readonly { questions: readonly RuleQuestion[] }[],
  answers: Readonly<Record<string, unknown>>,
): Set<string> {
  const shown = new Set<string>();
  const types = new Map<string, string | undefined>();

  for (const question of steps.flatMap((step) => step.questions)) {
    const checks = (question.rules ?? []).map(({ question: source, operator, value = '' }) => {
      const answer = shown.has(source) ? answers[source] : undefined;

      if (operator === 'hasValue') return present(answer);

      const matched = equals(answer, value, types.get(source));

      return operator === 'equals' ? matched : !matched;
    });

    const visible =
      checks.length === 0 ||
      (question.match === 'any' ? checks.some(Boolean) : checks.every(Boolean));

    types.set(question.key, question.type);
    if (visible) shown.add(question.key);
  }

  return shown;
}
