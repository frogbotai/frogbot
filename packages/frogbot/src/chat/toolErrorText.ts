/** The text a failed tool call is stored with: what the model saw when it ran, so a replay matches. */
export function toolErrorText(error: unknown): string {
  if (typeof error === 'string') return error;

  if (error instanceof Error) return error.toString();

  return JSON.stringify(error) ?? 'unknown error';
}
