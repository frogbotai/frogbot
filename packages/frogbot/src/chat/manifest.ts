import { listAgents } from '../agents/service.js';
import { enforceAIAccess } from '../ai/access.js';
import { isTargetAllowed, resolvePolicy } from '../ai/policy.js';
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

  if (!isTargetAllowed(resolvePolicy(req.user), model)) return false;

  try {
    await enforceAIAccess({ req, method: 'transcribe', input: '', config: ai });
  } catch {
    return false;
  }

  return { model };
}

export function buildManifestEndpoint() {
  return {
    path: '/frogbot',
    method: 'get' as const,
    handler: async (req: FrogBotRequest) => {
      const agents = await listAgents({ req });
      const transcribe = await transcriptionCapability({ req });

      const body: ManifestResponse = {
        ai: { transcribe },
        chat: req.frogbot.config.chat,
        files: req.frogbot.config.files,
        agents,
      };

      return Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
    },
  };
}
