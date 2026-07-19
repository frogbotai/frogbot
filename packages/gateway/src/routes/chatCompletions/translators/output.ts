import { jsonSchema, Output } from 'ai';

import { RequestValidationError } from '../../../errors/gatewayError.js';

// Maps the OpenAI chat `response_format` param to an AI SDK `Output` spec.
// The AI SDK's public structured-output API is the `output` option on
// `generateText`/`streamText` (ai generate-text.ts) — it resolves
// `output.responseFormat` into the LanguageModelV4CallOptions
// `responseFormat` key; a raw `responseFormat` in settings is overridden.
// `json_schema` → Output.object(...), `json_object` → Output.json(),
// `text`/absent → undefined (default text mode). Anything else is a 400.

type JsonSchemaConfig = {
  name?: string;
  description?: string;
  schema?: Record<string, unknown>;
};

export function toChatOutput(responseFormat: unknown): Output.Output | undefined {
  if (responseFormat == null) return undefined;
  const type = typeof responseFormat === 'object'
    ? (responseFormat as { type?: unknown }).type
    : undefined;

  if (type === 'text') return undefined;
  if (type === 'json_object') return Output.json();
  if (type === 'json_schema') {
    const config = (responseFormat as { json_schema?: JsonSchemaConfig }).json_schema;
    const schema = config?.schema;
    if (schema == null || typeof schema !== 'object') {
      throw new RequestValidationError({
        message: '`response_format.json_schema.schema` must be a JSON Schema object.',
        param: 'response_format.json_schema.schema',
      });
    }
    return Output.object({
      schema: jsonSchema(schema),
      name: config?.name ?? undefined,
      description: config?.description ?? undefined,
    });
  }

  throw new RequestValidationError({
    message: '`response_format.type` must be one of `text`, `json_object`, or `json_schema`.',
    param: 'response_format.type',
  });
}
