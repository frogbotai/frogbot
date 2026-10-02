import { jsonSchema, Output } from 'ai';

import type { ResponsesTextConfig } from '../schema.js';

/** Whether `text.format` asks for a strict JSON schema the reply must match. */
export function isStrictResponsesOutput(text: ResponsesTextConfig | null | undefined): boolean {
  const format = text?.format;

  return format?.type === 'json_schema' && format.strict === true && !!format.schema;
}

// Maps the Responses `text.format` config to an AI SDK `Output` spec.
// Only `json_schema` maps to structured output; `text`/`json_object`/unknown
// formats fall through to the default text output.
export function toResponsesOutput(
  text: ResponsesTextConfig | null | undefined,
): ReturnType<typeof Output.object> | undefined {
  const format = text?.format;
  if (!format || format.type !== 'json_schema' || !format.schema) return undefined;
  return Output.object({
    schema: jsonSchema(format.schema),
    name: format.name ?? undefined,
    description: format.description ?? undefined,
  });
}
