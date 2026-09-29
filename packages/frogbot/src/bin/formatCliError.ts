const prefix = '[frogbot]';

export function formatCliError(error: unknown, context?: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const detail = message.startsWith(prefix) ? message.slice(prefix.length).trimStart() : message;

  return context ? `${prefix} ${context}: ${detail}` : `${prefix} ${detail}`;
}
