import type { z } from 'zod';

import { RequestValidationError } from '../errors/gatewayError.js';
import { formatZodPath } from './formatZodPath.js';

export function parseWithSchema<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;

  const issue = result.error.issues[0];
  throw new RequestValidationError({
    message: issue?.message ?? 'Invalid request body',
    param: issue ? formatZodPath(issue.path) : '(body)',
  });
}
