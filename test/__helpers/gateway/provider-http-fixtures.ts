import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

type ProviderHttpExchange = {
  url: string;
  method: string;
  status: number;
  headers: Record<string, string>;
  bodyBase64: string;
};

type FixtureFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function shouldUpdateFixtures(): boolean {
  return process.argv.includes('--update');
}

export function createProviderFixtureFetch(args: {
  fixturePath: string;
  update?: boolean;
  fetch?: FixtureFetch;
}): FixtureFetch {
  const { fixturePath, update = false, fetch: realFetch = globalThis.fetch.bind(globalThis) } = args;
  let replayIndex = 0;
  const recorded: ProviderHttpExchange[] = [];
  const fixtures = !update && existsSync(fixturePath)
    ? JSON.parse(readFileSync(fixturePath, 'utf-8')) as ProviderHttpExchange[]
    : [];

  return async (input, init) => {
    const request = new Request(input, init);

    if (!update) {
      const exchange = fixtures[replayIndex++];
      if (!exchange) throw new Error(`No provider HTTP fixture for ${request.method} ${request.url}`);
      return new Response(Buffer.from(exchange.bodyBase64, 'base64'), {
        status: exchange.status,
        headers: exchange.headers,
      });
    }

    const response = await realFetch(request);
    const body = await response.clone().arrayBuffer();
    recorded.push({
      url: request.url,
      method: request.method,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      bodyBase64: Buffer.from(body).toString('base64'),
    });
    mkdirSync(dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, `${JSON.stringify(recorded, null, 2)}\n`);
    return response;
  };
}
