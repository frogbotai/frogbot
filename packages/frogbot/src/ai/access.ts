import type { FrogBotRequest } from '../types/request.js';
import type { AIAccessConfig, AIMethod, SanitizedAIConfig } from './types.js';

export type EnforceAccessArgs = {
  req: FrogBotRequest;
  method: AIMethod;
  model: string;
  config: SanitizedAIConfig;
};

export async function enforceAIAccess(args: EnforceAccessArgs): Promise<void> {
  const { req, method, model, config } = args;

  const category = methodToCategory(method);
  const baseFn = config.access[category];
  if (baseFn && !(await baseFn({ req, model }))) {
    throw new AIAccessError(`Access denied for AI ${category}`);
  }
}

export async function canUseAIModel({
  req,
  method,
  model,
}: {
  req: FrogBotRequest;
  method: AIMethod;
  model: string;
}): Promise<boolean> {
  const config = req.frogbot.config.ai;

  if (!req.user || !config) return true;

  try {
    await enforceAIAccess({ req, method, model, config });

    return true;
  } catch (error) {
    if (isAccessDenial(error)) return false;

    throw error;
  }
}

function isAccessDenial(error: unknown): boolean {
  return error instanceof Error && typeof (error as { status?: unknown }).status === 'number';
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
    case 'evaluate':
      return 'evaluate';
  }
}

export class AIAccessError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = 'AIAccessError';
  }
}
