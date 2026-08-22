import { type EnvBuilderDescriptor } from './builders.js';
import { deriveName } from './deriveName.js';
import { FrogbotEnvError, type EnvIssue } from './error.js';

type SchemaBuilder = { readonly _output: unknown };
type EnvSchema = Record<string, SchemaBuilder>;

export type DefinedEnv<TSchema extends EnvSchema> = Readonly<{
  [TKey in keyof TSchema]: TSchema[TKey] extends { readonly _output: infer TOutput }
    ? TOutput
    : never;
}>;

export const defineEnv = <const TSchema extends EnvSchema>(
  schema: TSchema,
): DefinedEnv<TSchema> => {
  const entries = Object.entries(schema) as [string, EnvBuilderDescriptor][];
  const envNames = new Set<string>();

  for (const [key, builder] of entries) {
    const envName = builder.envName ?? deriveName(key);
    if (envNames.has(envName)) throw new Error(`Duplicate env variable name: ${envName}`);
    envNames.add(envName);
  }

  const source = { ...process.env };
  const values: Record<string, unknown> = {};
  const issues: EnvIssue[] = [];
  const invalidKeys = new Set<string>();

  for (const [key, builder] of entries) {
    const envName = builder.envName ?? deriveName(key);
    const raw = source[envName] === '' ? undefined : source[envName];

    if (raw === undefined) {
      values[key] = builder.hasDefault ? builder.defaultValue : undefined;
      continue;
    }

    const result = builder.parse(raw);
    if (result.success) {
      values[key] = result.value;
    } else {
      invalidKeys.add(key);
      issues.push({ envName, message: result.error, name: key });
    }
  }

  if (source.NODE_ENV !== 'test') {
    for (const [key, builder] of entries) {
      if (invalidKeys.has(key) || values[key] !== undefined || !builder.requiredMode) continue;

      let required = builder.requiredMode === 'always';
      if (builder.requiredMode === 'conditional') {
        try {
          required = builder.requiredPredicate?.(values) ?? false;
        } catch (error) {
          throw new Error(
            `Required predicate for ${key} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      if (required) {
        issues.push({
          envName: builder.envName ?? deriveName(key),
          message: 'is required',
          name: key,
        });
      }
    }
  }

  if (issues.length) throw new FrogbotEnvError(issues);

  return Object.freeze(values) as DefinedEnv<TSchema>;
};
