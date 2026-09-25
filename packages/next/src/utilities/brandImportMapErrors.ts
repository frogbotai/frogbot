const missingComponentMessage = 'getFromImportMap: PayloadComponent not found in importMap';
const installed = Symbol.for('frogbot.brandImportMapErrors');

type MissingComponentDetails = {
  key: string;
};

function isMissingComponentDetails(value: unknown): value is MissingComponentDetails {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { key?: unknown }).key === 'string'
  );
}

export function formatMissingComponentError({ key }: MissingComponentDetails): string {
  return `[frogbot] Component "${key}" is missing from the import map. Run \`frogbot generate:importmap\`, then rebuild or restart the app.`;
}

export function brandImportMapErrors(): void {
  const globals = globalThis as typeof globalThis & { [installed]?: true };

  if (globals[installed]) return;

  globals[installed] = true;

  const error = console.error;

  console.error = (...args: unknown[]) => {
    const [message, details] = args;

    if (message === missingComponentMessage && isMissingComponentDetails(details)) {
      error.call(console, formatMissingComponentError(details));

      return;
    }

    error.apply(console, args);
  };
}
