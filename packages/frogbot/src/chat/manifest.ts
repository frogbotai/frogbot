import { listAgents } from '../agents/service.js';
import { getFilteredCatalog } from '../ai/catalog.js';
import type { FrogbotRequest } from '../types/request.js';
import type { ManifestResponse } from './types.js';

export function buildManifestEndpoint() {
  return {
    path: '/frogbot',
    method: 'get' as const,
    handler: async (req: FrogbotRequest) => {
      const agents = await listAgents({ req });

      const transcription = getFilteredCatalog(
        new Set(Object.keys(req.frogbot.config.ai?.providers ?? {})),
      ).find((entry) => entry.mode === 'audio_transcription');
      const body: ManifestResponse = {
        ai: { transcribe: transcription ? { model: transcription.id } : false },
        chat: req.frogbot.config.chat,
        files: req.frogbot.config.files,
        agents,
      };
      return Response.json(body, { headers: { 'Cache-Control': 'private, no-store' } });
    },
  };
}
