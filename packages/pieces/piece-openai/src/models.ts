import { z } from 'zod';

const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

const modelList = z.object({ data: z.array(z.object({ id: z.string() })) });

const errorBody = z.object({ error: z.object({ message: z.string() }) });

/** An OpenAI API error, with the HTTP `status` FrogBot reads to tell a rejected key apart. */
export class OpenAIRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`OpenAI answered ${status} when listing models.`);
    this.name = 'OpenAIRequestError';
    this.status = status;
  }
}

async function lacksListPermission(response: Response): Promise<boolean> {
  if (response.status !== 401 && response.status !== 403) return false;

  const body = errorBody.safeParse(await response.json().catch(() => undefined));

  return body.success && /insufficient permissions|missing scopes/i.test(body.data.error.message);
}

/**
 * The model IDs an OpenAI API key can use, from `GET /v1/models`. `undefined` for a valid key
 * that may not list models, so the picker shows the app's usual list.
 */
export async function listOpenAIModels({
  apiKey,
  signal,
}: {
  apiKey: string;
  signal: AbortSignal;
}): Promise<string[] | undefined> {
  const response = await fetch(OPENAI_MODELS_URL, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal,
  });

  if (!response.ok) {
    if (await lacksListPermission(response)) return undefined;

    throw new OpenAIRequestError(response.status);
  }

  const { data } = modelList.parse(await response.json());

  return data.map(({ id }) => id);
}
