import type { Frogbot } from '../frogbot.js';
import { AIAccessError, enforceAIAccess } from '../ai/access.js';
import type { AIMethod } from '../types/ai.js';

type HandleGatewayRequestArgs = {
  frogbot: Frogbot;
  request: Request;
};

export type GatewayHandler = (request: Request) => Promise<Response>;

export function createGatewayHandler(frogbot: Frogbot): GatewayHandler {
  return (request) => handleGatewayRequest({ frogbot, request });
}

function methodForPath(pathname: string): AIMethod | undefined {
  if (/\/(?:chat\/completions|messages|responses|images\/generations|audio\/speech|videos\/generations)$/.test(pathname)) return 'generateText';
  if (/\/embeddings$/.test(pathname)) return 'embed';
  if (/\/audio\/transcriptions$/.test(pathname)) return 'transcribe';
  if (/\/rerank$/.test(pathname)) return 'rerank';
}

export async function handleGatewayRequest({ frogbot, request }: HandleGatewayRequestArgs): Promise<Response> {
  const gateway = frogbot.gateway;
  const ai = frogbot.config.ai;
  if (!gateway || !ai) {
    throw new Error('AI is not configured. Add an `ai` block to your FrogBot config.');
  }

  const req = await frogbot.createRequest({ headers: request.headers });
  const auth = await frogbot.auth({ headers: request.headers, req });
  req.user = auth.user;
  if (!req.user) {
    return Response.json({ error: { message: 'Unauthorized', type: 'authentication_error' } }, { status: 401 });
  }

  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/api\/ai(?=\/|$)/, '') || '/';
  const method = methodForPath(url.pathname);
  if (method) {
    try {
      await enforceAIAccess({ req, method, input: '', config: ai });
    } catch (error) {
      if (error instanceof AIAccessError) {
        return Response.json(
          { error: { message: error.message, type: 'permission_error' } },
          { status: error.status },
        );
      }
      throw error;
    }
  }
  const forwarded = new Request(url, request);

  // The gateway's route handlers own the full 5-phase hook lifecycle. We only
  // seed `req` into the hook context so FrogBot's hooks see it (Payload-style
  // `args.req`); no FrogBot-side lifecycle needed.
  return gateway.handler(forwarded, { context: { req } });
}
