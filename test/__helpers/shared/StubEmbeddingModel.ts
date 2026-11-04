import { createServer, type IncomingMessage, type Server } from 'node:http';

export type StubEmbeddingRequest = {
  model: string;
  input: string[];
};

export type StubEmbeddingResponse = {
  dimensions?: number;
  error?: { status: number; body: unknown };
};

export type StubEmbeddingModel = {
  requests: StubEmbeddingRequest[];
  respond: (...responses: StubEmbeddingResponse[]) => void;
  vectorFor: (text: string, dimensions?: number) => number[];
  reset: () => void;
  close: () => Promise<void>;
};

async function readJSON(
  req: IncomingMessage,
): Promise<{ model: string; input: string | string[] }> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) chunks.push(Buffer.from(chunk));

  return JSON.parse(Buffer.concat(chunks).toString()) as {
    model: string;
    input: string | string[];
  };
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
}

/**
 * OpenAI-compatible embeddings stub. Each input gets a vector derived from its
 * text, so the same text always gets the same vector and a query vector from
 * `vectorFor` matches what a save stored. Each request is recorded and consumes
 * the next scripted response, which can change the vector size or fail with an
 * HTTP error.
 */
export async function startStubEmbeddingModel({
  dimensions,
  port,
}: {
  dimensions: number;
  port: number;
}): Promise<StubEmbeddingModel> {
  const requests: StubEmbeddingRequest[] = [];
  const responses: StubEmbeddingResponse[] = [];

  const vectorFor = (text: string, size = dimensions): number[] => {
    const vector = Array.from({ length: size }, () => 1);

    for (const [index, char] of [...text].entries()) {
      vector[index % size] += (char.codePointAt(0) ?? 0) * (index + 1);
    }

    return vector;
  };

  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || !req.url?.endsWith('/embeddings')) {
      res.writeHead(404).end();

      return;
    }

    const body = await readJSON(req);
    const input = Array.isArray(body.input) ? body.input : [body.input];

    requests.push({ model: body.model, input });

    const response = responses.shift() ?? {};

    if (response.error) {
      res.writeHead(response.error.status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(response.error.body));

      return;
    }

    res.setHeader('content-type', 'application/json');

    res.end(
      JSON.stringify({
        object: 'list',
        model: body.model,
        data: input.map((text, index) => ({
          object: 'embedding',
          index,
          embedding: vectorFor(text, response.dimensions),
        })),
        usage: { prompt_tokens: 3, total_tokens: 3 },
      }),
    );
  });

  await listen(server, port);

  return {
    requests,
    respond: (...next) => {
      responses.push(...next);
    },
    vectorFor,
    reset: () => {
      requests.length = 0;
      responses.length = 0;
    },
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
