import { jsonSchema, Output } from 'ai';

import type { ResponsesTextConfig } from '../schema.js';

/** Whether `text.format` asks for a strict JSON schema the reply must match. */
export function isStrictResponsesOutput(text: ResponsesTextConfig | null | undefined): boolean {
  const format = text?.format;

  return format?.type === 'json_schema' && format.strict === true && !!format.schema;
}

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
