// AI access control enforcement.

import type { AIAccessConfig, AIMethod, SanitizedAIConfig } from '../types/ai.js';
import type { FrogbotRequest } from '../types/request.js';

export type EnforceAccessArgs = {
  req: FrogbotRequest;
  method: AIMethod;
  input: string;
  config: SanitizedAIConfig;
};

export async function enforceAIAccess(args: EnforceAccessArgs): Promise<void> {
  const { req, method, config } = args;

  // 1. Base access.
  const category = methodToCategory(method);
  const baseFn = config.access[category];
  if (baseFn && !(await baseFn({ req }))) {
    throw new AIAccessError(`Access denied for AI ${category}`);
  }
}

export function methodToCategory(method: AIMethod): keyof AIAccessConfig {
  switch (method) {
    case 'generateText':
    case 'streamText':
    case 'generateImage':
    case 'generateSpeech':
    case 'generateVideo':
      return 'generate';
    case 'embed':
    case 'embedMany':
      return 'embed';
    case 'transcribe':
      return 'transcribe';
    case 'rerank':
      return 'rerank';
  }
}

export class AIAccessError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = 'AIAccessError';
  }
}
