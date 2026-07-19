// Typed intermediate SSE frame representation.
//
// Both routes construct wire chunks and errors via the same typed frame
// before serialization. Keeping a discriminated union in the middle lets
// heartbeat/keep-alive/[DONE] logic live in one place (see `toSseStream`)
// without any translator having to know about SSE framing.
//
// **Ref:** hebo `utils/stream.ts`.

/**
 * A single SSE frame: either a data event carrying a translator payload,
 * a named event with a payload (Anthropic uses this shape), a comment
 * (used for keep-alive heartbeats), a raw pre-serialized string, or the
 * terminal `[DONE]` sentinel.
 *
 * `T` is the translator-emitted payload type (already an OpenAI/Anthropic
 * chunk object); `E` is the error payload type routed through the error
 * branch of the underlying source stream.
 */
export type SseFrame<T = unknown, _E = unknown> =
  | { kind: 'data'; data: T }
  | { kind: 'event'; event: string; data: T }
  | { kind: 'comment'; text: string }
  | { kind: 'raw'; text: string }
  | { kind: 'done' };

/** Serialize a single frame to its wire representation. */
export function serializeSseFrame(frame: SseFrame): string {
  switch (frame.kind) {
    case 'data':
      return `data: ${JSON.stringify(frame.data)}\n\n`;
    case 'event':
      return `event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`;
    case 'comment':
      return `: ${frame.text}\n\n`;
    case 'raw':
      return frame.text;
    case 'done':
      return 'data: [DONE]\n\n';
  }
}
