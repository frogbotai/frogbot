import { exaAuth } from './config.js';

const baseUrl = 'https://api.exa.ai';

export type ExaClient = ReturnType<typeof createExaClient>;

export class ExaRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(`Exa request failed with status ${status}.`);
    this.name = 'ExaRequestError';
  }
}

export function createExaClient({ auth }: { auth: unknown }) {
  const { apiKey } = exaAuth.parse(auth);

  return async <T>(path: string, body: Record<string, unknown>, signal?: AbortSignal) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal,
    });
    const data: unknown = await response.json();

    if (!response.ok) throw new ExaRequestError(response.status, data);

    return data as T;
  };
}
