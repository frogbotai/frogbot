import { createServer } from 'node:http';

const requests = [];

const server = createServer(async (req, res) => {
  if (req.url === '/health') {
    res.end('ready');

    return;
  }

  if (req.url === '/requests') {
    if (req.method === 'DELETE') requests.length = 0;

    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(requests));

    return;
  }

  if (req.method !== 'POST' || req.url !== '/v1/chat/completions') {
    res.writeHead(404).end();

    return;
  }

  const chunks = [];

  for await (const chunk of req) chunks.push(chunk);

  const body = JSON.parse(Buffer.concat(chunks).toString());
  requests.push(body);

  const images = body.messages.flatMap((message) =>
    Array.isArray(message.content)
      ? message.content.filter((part) => part.type === 'image_url')
      : [],
  );

  const text = `Received ${images.length} image attachment.`;
  const completion = {
    id: 'browser-completion',
    created: 1,
    model: body.model,
  };

  if (!body.stream) {
    res.setHeader('content-type', 'application/json');
    res.end(
      JSON.stringify({
        ...completion,
        object: 'chat.completion',
        choices: [
          { index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      }),
    );

    return;
  }

  res.setHeader('content-type', 'text/event-stream');

  for (const choice of [
    { index: 0, delta: { role: 'assistant', content: text }, finish_reason: null },
    { index: 0, delta: {}, finish_reason: 'stop' },
  ]) {
    res.write(
      `data: ${JSON.stringify({ ...completion, object: 'chat.completion.chunk', choices: [choice] })}\n\n`,
    );
  }

  res.end('data: [DONE]\n\n');
});

server.listen(Number(process.env.PORT || 3126), 'localhost');
