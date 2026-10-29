import { listAgents } from '../agents/service.js';
import { enforceAIAccess } from '../ai/access.js';
import { resolveModel } from '../ai/resolve.js';
import type { FrogBotRequest } from '../types/request.js';
import type { ManifestResponse } from './types.js';

async function transcriptionCapability({
  req,
}: {
  req: FrogBotRequest;
}): Promise<ManifestResponse['ai']['transcribe']> {
  const ai = req.frogbot.config.ai;

  if (!ai?.transcriptionModel || !req.user) return false;

  const model = resolveModel(ai.transcriptionModel, ai);

  try {
    await enforceAIAccess({ req, method: 'transcribe', model, config: ai });
  } catch {
    return false;
  }

  return { model };
}

async function speechCapability({
  req,
}: {
  req: FrogBotRequest;
}): Promise<ManifestResponse['ai']['speak']> {
  const ai = req.frogbot.config.ai;

  if (!ai?.speechModel || !req.user) return false;

  const model = resolveModel(ai.speechModel, ai);

  try {
    await enforceAIAccess({ req, method: 'generateSpeech', model, config: ai });
  } catch {
    return false;
  }

  return { model, ...(ai.speechVoice && { voice: ai.speechVoice }) };
}

export function buildManifestEndpoint() {
  return {
    path: '/frogbot',
    method: 'get' as const,
    handler: async (req: FrogBotRequest) => {
      const [agents, transcribe, speak] = await Promise.all([
        listAgents({ req }),
        transcriptionCapability({ req }),
        speechCapability({ req }),
      ]);

      const body: ManifestResponse = {
        ai: { transcribe, speak },
        chat: req.frogbot.config.chat,
        files: req.frogbot.config.files,
        agents,
      };

      return Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
    },
  };
}
