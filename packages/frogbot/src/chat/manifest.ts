import { getFilteredCatalog } from '../ai/catalog.js';
import type { ManifestResponse } from '../types/chat.js';
import type { FrogbotRequest } from '../types/request.js';

export function buildManifestEndpoint() {
  return {
    path: '/frogbot',
    method: 'get' as const,
    handler: async (req: FrogbotRequest) => {
      const agents: ManifestResponse['agents'] = [];

      for (const instance of Object.values(req.frogbot.agents)) {
        const access = instance.config.access ?? (({ req: current }: { req: FrogbotRequest }) => !!current.user);
        try {
          if (await access({ req })) agents.push({
            slug: instance.slug,
            ...(instance.config.profile ? { profile: instance.config.profile } : {}),
          });
        } catch {
          continue;
        }
      }

      const transcription = getFilteredCatalog(new Set(Object.keys(req.frogbot.config.ai?.providers ?? {})))
        .find((entry) => entry.mode === 'audio_transcription');
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
