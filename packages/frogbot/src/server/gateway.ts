import {
  isGatewayError,
  type StatusError,
  toAnthropicErrorResponse,
  toOpenAIErrorResponse,
  toStatusErrorResponse,
} from '@frogbotai/gateway/errors';

import { AIAccessError, enforceAIAccess } from '../ai/access.js';
import type { AIMethod } from '../ai/types.js';
import type { FrogBot } from '../frogbot.js';

type HandleGatewayRequestArgs = {
  frogbot: FrogBot;
  request: Request;
};

export type GatewayHandler = (request: Request) => Promise<Response>;

export function createGatewayHandler(frogbot: FrogBot): GatewayHandler {
  return (request) => handleGatewayRequest({ frogbot, request });
}

function methodForPath(pathname: string): AIMethod | undefined {
  if (
    /\/(?:chat\/completions|messages|responses|images\/generations|audio\/speech|videos\/generations)$/.test(
      pathname,
    )
  ) {
    return 'generateText';
  }

  if (/\/embeddings$/.test(pathname)) return 'embed';
  if (/\/audio\/transcriptions$/.test(pathname)) return 'transcribe';
  if (/\/rerank$/.test(pathname)) return 'rerank';
  if (/\/evaluate$/.test(pathname)) return 'evaluate';
}

type ErrorFormat = 'openai' | 'anthropic';

function errorResponse(format: ErrorFormat, error: StatusError): Response {
  const { body, status } = toStatusErrorResponse(format, error);

  return Response.json(body, { status });
}

function accessErrorResponse(format: ErrorFormat, error: unknown): Response | undefined {
  if (isGatewayError(error)) {
    const { body, status } =
      format === 'anthropic' ? toAnthropicErrorResponse(error) : toOpenAIErrorResponse(error);

    return Response.json(body, { status });
  }

  if (error instanceof AIAccessError) {
    return errorResponse(format, { status: error.status, message: error.message });
  }

  if (
    error instanceof Error &&
    'status' in error &&
    'code' in error &&
    typeof error.status === 'number'
  ) {
    const param = 'param' in error && typeof error.param === 'string' ? error.param : null;

    return errorResponse(format, {
      status: error.status,
      message: error.message,
      code: String(error.code),
      param,
    });
  }
}

async function readRequestedModel(request: Request): Promise<string | undefined> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.startsWith('multipart/form-data')) {
    const model = (await request.clone().formData()).get('model');

    return typeof model === 'string' ? model : undefined;
  }

  const body = (await request.clone().json()) as { model?: unknown } | null;

  return typeof body?.model === 'string' ? body.model : undefined;
}

export async function handleGatewayRequest({
  frogbot,
  request,
}: HandleGatewayRequestArgs): Promise<Response> {
  const gateway = frogbot.gateway;
  const ai = frogbot.config.ai;
  if (!gateway || !ai) {
    throw new Error('AI is not configured. Add an `ai` block to your FrogBot config.');
  }

  const url = new URL(request.url);
  url.pathname = url.pathname.replace(/^\/api(?=\/|$)/, '') || '/';
  const format: ErrorFormat = /\/messages$/.test(url.pathname) ? 'anthropic' : 'openai';

  const req = await frogbot.createRequest({ headers: request.headers });
  const auth = await frogbot.auth({ headers: request.headers, req });
  req.user = auth.user;
  if (!req.user) return errorResponse(format, { status: 401, message: 'Unauthorized' });

  const method = methodForPath(url.pathname);
  if (method) {
    const model = await readRequestedModel(request).catch(() => null);

    if (model === null) {
      return errorResponse(format, {
        status: 400,
        message: 'Invalid request body.',
        code: 'invalid_request_body',
      });
    }

    try {
      await enforceAIAccess({ req, method, model: model ?? '', config: ai });
    } catch (error) {
      const response = accessErrorResponse(format, error);
      if (response) return response;

      throw error;
    }
  }

  const forwarded = new Request(url, request);

  return gateway.handler(forwarded, { context: { req } });
}
