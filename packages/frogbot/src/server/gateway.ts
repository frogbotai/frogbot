import type { Frogbot } from '../frogbot.js';

type HandleGatewayRequestArgs = {
  frogbot: Frogbot;
  request: Request;
};

export type GatewayHandler = (request: Request) => Promise<Response>;

export function createGatewayHandler(frogbot: Frogbot): GatewayHandler {
  return (request) => handleGatewayRequest({ frogbot, request });
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
  const forwarded = new Request(url, request);

  // The gateway's route handlers own the full 5-phase hook lifecycle. We only
  // seed `req` into the hook context so FrogBot's hooks see it (Payload-style
  // `args.req`); no FrogBot-side lifecycle needed.
  return gateway.handler(forwarded, { context: { req } });
}
