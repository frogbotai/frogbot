// Parse raw SSE text into structured frames.

export type SseFrame = {
  event?: string;
  data: string;
};

export function parseSse(raw: string): SseFrame[] {
  const frames: SseFrame[] = [];
  const chunks = raw.split('\n\n').filter((c) => c.trim().length > 0);

  for (const chunk of chunks) {
    const lines = chunk.split('\n');
    let event: string | undefined;
    let data = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        event = line.slice(7);
      } else if (line.startsWith('data: ')) {
        data += line.slice(6);
      } else if (line.startsWith(':')) {
        // comment (heartbeat), skip
      }
    }

    if (data) {
      frames.push({ event, data });
    }
  }

  return frames;
}

export function parseSseJson<T = unknown>(raw: string): T[] {
  return parseSse(raw)
    .filter((f) => f.data !== '[DONE]')
    .map((f) => JSON.parse(f.data) as T);
}
