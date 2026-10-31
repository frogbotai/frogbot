import { z } from 'zod';

const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

const modelList = z.object({ data: z.array(z.object({ id: z.string() })) });

/** An OpenAI API error, with the HTTP `status` FrogBot reads to tell a rejected key apart. */
export class OpenAIRequestError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`OpenAI answered ${status} when listing models.`);
    this.name = 'OpenAIRequestError';
    this.status = status;
  }
}

/** The model IDs an OpenAI API key can use, from `GET /v1/models`. */
export async function listOpenAIModels({
  apiKey,
  signal,
}: {
  apiKey: string;
  signal: AbortSignal;
}): Promise<string[]> {
  const response = await fetch(OPENAI_MODELS_URL, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal,
  });

  if (!response.ok) throw new OpenAIRequestError(response.status);

  const { data } = modelList.parse(await response.json());

  return data.map(({ id }) => id);
}
