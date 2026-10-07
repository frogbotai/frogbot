import { jsonSchema, Output } from 'ai';

import { RequestValidationError } from '../../../errors/gatewayError.js';

type JsonSchemaConfig = {
  name?: string;
  description?: string;
  schema?: Record<string, unknown>;
  strict?: boolean | null;
};

/** Whether `response_format` asks for a strict JSON schema the reply must match. */
export function isStrictChatOutput(responseFormat: unknown): boolean {
  if (responseFormat == null || typeof responseFormat !== 'object') return false;

  const format = responseFormat as { type?: unknown; json_schema?: JsonSchemaConfig };

  return format.type === 'json_schema' && format.json_schema?.strict === true;
}

export function toChatOutput(responseFormat: unknown): Output.Output | undefined {
  if (responseFormat == null) return undefined;
  const type =
    typeof responseFormat === 'object' ? (responseFormat as { type?: unknown }).type : undefined;

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
