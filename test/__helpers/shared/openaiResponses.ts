/** One Responses API server-sent event. */
export type ResponsesEvent = Record<string, unknown> & { type: string };

const response = { id: 'resp_1', created_at: 1, model: 'gpt-5.5', service_tier: null };

const usage = {
  input_tokens: 1,
  input_tokens_details: { cached_tokens: 0 },
  output_tokens: 1,
  output_tokens_details: { reasoning_tokens: 0 },
  total_tokens: 2,
};

/** The events of a streamed reply that says `text`, before `response.completed`. */
export function textEvents(text: string): ResponsesEvent[] {
  return [
    { type: 'response.created', response },
    { type: 'response.in_progress', response },
    {
      type: 'response.output_item.added',
      output_index: 0,
      item: { type: 'message', id: 'msg_1', status: 'in_progress', role: 'assistant', content: [] },
    },
    { type: 'response.output_text.delta', item_id: 'msg_1', output_index: 0, delta: text },
    {
      type: 'response.output_item.done',
      output_index: 0,
      item: {
        type: 'message',
        id: 'msg_1',
        status: 'completed',
        role: 'assistant',
        content: [{ type: 'output_text', text, annotations: [] }],
      },
    },
  ];
}

export const completedEvent: ResponsesEvent = {
  type: 'response.completed',
  response: { ...response, status: 'completed', incomplete_details: null, usage },
};

/** A `response.failed` event carrying OpenAI's error `code`. */
export function failedEvent(code: string): ResponsesEvent {
  return {
    type: 'response.failed',
    sequence_number: 9,
    response: { ...response, status: 'failed', error: { code, message: `failed: ${code}` } },
  };
}

/** A streamed Responses API reply made of `events`. */
export function eventStream(events: ResponsesEvent[]): Response {
  const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join('');

  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

/** A streamed reply that says `text`. */
export function textStream(text: string): Response {
  return eventStream([...textEvents(text), completedEvent]);
}

/** A streamed reply that sends one of `events` every `gapMs`, as a slow network does. */
export function pausedEventStream(events: ResponsesEvent[], gapMs: number): Response {
  const encoder = new TextEncoder();
  const frames = events.map((event) => encoder.encode(`data: ${JSON.stringify(event)}\n\n`));

  return new Response(
    new ReadableStream({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, gapMs));

        const frame = frames.shift();

        if (frame) controller.enqueue(frame);
        else controller.close();
      },
    }),
    { headers: { 'content-type': 'text/event-stream' } },
  );
}
