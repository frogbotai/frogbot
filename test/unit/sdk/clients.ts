import { PayloadSDK } from '@payloadcms/sdk';

import { createFrogBotSDK, type UntypedFrogBotSDKTypes } from '../../../packages/sdk/src/index';

export const baseURL = 'https://frogbot.example/api';

export type RecordedRequest = {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  body: unknown;
};

type ResponseFactory = () => Response;

async function readBody(body: BodyInit | null | undefined): Promise<unknown> {
  if (body instanceof FormData) {
    const entries: Record<string, unknown> = {};

    for (const [key, value] of body.entries()) {
      entries[key] =
        typeof value === 'string'
          ? value
          : { name: value.name, size: value.size, text: await value.text(), type: value.type };
    }

    return entries;
  }

  if (typeof body === 'string') return JSON.parse(body);

  return body ?? undefined;
}

function recordingFetch({
  requests,
  respond,
}: {
  requests: RecordedRequest[];
  respond: ResponseFactory;
}): typeof fetch {
  return async (input, init) => {
    requests.push({
      url: String(input),
      method: init?.method,
      headers: Object.fromEntries(new Headers(init?.headers).entries()),
      body: await readBody(init?.body),
    });

    return respond();
  };
}

export function createClients(respond: ResponseFactory = () => Response.json({ doc: { id: 1 } })) {
  const frogbotRequests: RecordedRequest[] = [];
  const payloadRequests: RecordedRequest[] = [];

  const frogbot = createFrogBotSDK<UntypedFrogBotSDKTypes>({
    baseURL,
    fetch: recordingFetch({ requests: frogbotRequests, respond }),
  });

  const payload = new PayloadSDK({
    baseURL,
    fetch: recordingFetch({ requests: payloadRequests, respond }),
  });

  return { frogbot, frogbotRequests, payload, payloadRequests };
}
