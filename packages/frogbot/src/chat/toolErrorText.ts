import { toProblem } from '../errors/toProblem.js';

/** A failed tool call, rethrown with the text the model reads as its message. */
export class ToolFailure extends Error {
  override name = 'ToolFailure';

  constructor(error: unknown) {
    super(describeToolError(error), { cause: error });
  }

  override toString(): string {
    return this.message;
  }
}

function describeToolError(error: unknown): string {
  const problem = toProblem(error, { debug: true });

  if (problem.code === 'internal') {
    const message =
      error instanceof Error ? error.message : (JSON.stringify(error) ?? String(error));

    return `internal: ${message}`;
  }

  return `${problem.code}: ${problem.detail}\n${JSON.stringify(problem)}`;
}

/** The text a failed tool call is stored with: what the model saw when it ran, so a replay matches. */
export function toolErrorText(error: unknown): string {
  if (typeof error === 'string') return error;

  if (error instanceof ToolFailure) return error.message;

  return describeToolError(error);
}
