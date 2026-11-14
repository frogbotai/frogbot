import { type App, frogbotBin, runStep, StepError } from './runtime.js';

type SchemaLine = {
  frogbot: 'schema';
  ok: boolean;
  applied: number;
  kept?: string[];
  error?: string;
};

/** Writes the schema step's kept line when it differs from the last one; returns it as the new last. */
export function reportKept(
  kept: string[],
  last: string | undefined,
  write: (line: string) => void,
): string {
  const line = kept.join('\n');

  if (line && line !== last) write(line);

  return line;
}

/** Brings the database's schema up to the new code in a child `frogbot up` run; throws when it refuses. */
export async function syncSchema(app: App, reported: { kept?: string }): Promise<void> {
  let output: string;

  try {
    output = await runStep(
      app,
      'schema',
      [frogbotBin, 'up'],
      { ...app.env, NODE_ENV: 'production', FROGBOT_SERVICE: 'schema' },
      { quiet: true },
    );
  } catch (error) {
    const stepOutput = error instanceof StepError ? error.output : '';
    const line = parseSchemaLine(stepOutput);

    app.log.write('schema', stepOutput);

    if (line?.error) throw new StepError(`schema sync refused: ${line.error}`, '');

    throw error;
  }

  const line = parseSchemaLine(output);

  if (!line) {
    app.log.write('schema', output);

    throw new StepError('schema sync printed no result', output);
  }

  reported.kept = reportKept(line.kept ?? [], reported.kept, (kept) =>
    app.log.write('schema', kept),
  );

  if (!line.ok) throw new StepError(`schema sync refused: ${line.error}`, '');
  if (line.applied) app.log.write('supervisor', `schema sync applied ${line.applied} statements`);
}

function parseSchemaLine(output: string): SchemaLine | undefined {
  const last = output.trim().split('\n').at(-1) ?? '';

  try {
    const value = JSON.parse(last) as SchemaLine;

    return value?.frogbot === 'schema' ? value : undefined;
  } catch {
    return undefined;
  }
}
