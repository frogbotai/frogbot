// SSE stream helper — heartbeat, [DONE] sentinel, and reader cancel on client abort.
//
// Wraps an inner string stream (already SSE-framed by a translator) with:
//   - A 15s heartbeat comment (`: heartbeat\n\n`) on silence — keeps
//     idle TCP connections alive across proxies (nginx, Cloudflare, ALB).
//   - An optional terminal `[DONE]` sentinel appended after the inner
//     stream closes normally (OpenAI convention; Anthropic uses `event: message_stop`
//     inline and does NOT want `[DONE]`).
//   - Reader cancel propagation on client abort — when the HTTP response
//     body is cancelled we cancel the upstream reader so the AI SDK stops
//     the upstream request instead of leaking tokens.
//   - An optional error-to-frame mapper for stream-time errors so the
//     handler can format the error as an SSE frame in the client's wire format
//     rather than surfacing a naked exception.
//
// `createSseResponse` wraps the string stream with `text/event-stream`
// headers and TextEncoder piping.
//
// **Ref:** hebo `utils/stream.ts`; opencode `server/routes/instance/httpapi/event.ts:60-64`.

import { serializeSseFrame, type SseFrame } from './sseFrame.js';

const DEFAULT_HEARTBEAT_MS = 15_000;

export const SSE_RESPONSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
} as const;

export type ToSseStreamOptions<TError = unknown> = {
  /**
   * Emit a terminal `data: [DONE]\n\n` after the inner stream closes.
   * OpenAI: `true` (their SSE clients wait for this marker).
   * Anthropic: `false` (they use `event: message_stop` inline).
   */
  appendDone: boolean;

  /**
   * Heartbeat interval in ms. Set to `0` to disable.
   * Default 15_000 (15s) — beats every proxy idle timeout we've seen.
   */
  keepAliveMs?: number;

  /**
   * Map a stream-time error into one or more SSE frames. Used when the
   * inner (upstream) stream throws mid-flight — the handler wants the
   * client to see a wire-format error, not a torn connection.
   */
  toError?: (err: TError) => SseFrame[] | string;

  /**
   * Fired at every terminal point of the inner stream: normal close
   * (before the optional `[DONE]` frame), a stream-time error (whether or
   * not `toError` maps it to a wire frame), and client-initiated
   * `cancel()`. This is the fallback finalize trigger for streaming
   * lifecycle hooks (see `shared/streamLifecycle.ts`) — the only signal
   * left once `streamText`'s own `onFinish`/`onError`/`onAbort` have all
   * had their chance to fire.
   */
  onDone?: (outcome: ToSseStreamDoneOutcome) => void | Promise<void>;
};

export type ToSseStreamDoneOutcome =
  | { kind: 'done' }
  | { kind: 'error'; error: unknown }
  | { kind: 'cancel'; reason?: unknown };

/**
 * Wrap an inner SSE string stream with heartbeat + termination + abort
 * handling. The inner stream is assumed to already be SSE-framed
 * (`data: ...\n\n` etc.) by the translator upstream.
 */
export function toSseStream<TError = unknown>(
  inner: ReadableStream<string>,
  opts: ToSseStreamOptions<TError>,
): ReadableStream<string> {
  const heartbeatMs = opts.keepAliveMs ?? DEFAULT_HEARTBEAT_MS;
  const reader = inner.getReader();

  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let cancelled = false;

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  return new ReadableStream<string>({
    start(controller) {
      if (heartbeatMs > 0) {
        heartbeatTimer = setInterval(() => {
          if (!cancelled) {
            controller.enqueue(serializeSseFrame({ kind: 'comment', text: 'heartbeat' }));
          }
        }, heartbeatMs);
      }
    },

    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          stopHeartbeat();
          await opts.onDone?.({ kind: 'done' });
          if (opts.appendDone) {
            controller.enqueue(serializeSseFrame({ kind: 'done' }));
          }
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        stopHeartbeat();
        await opts.onDone?.({ kind: 'error', error: err });
        if (opts.toError) {
          const mapped = opts.toError(err as TError);
          const text =
            typeof mapped === 'string'
              ? mapped
              : mapped.map(serializeSseFrame).join('');
          controller.enqueue(text);
          if (opts.appendDone) {
            controller.enqueue(serializeSseFrame({ kind: 'done' }));
          }
          controller.close();
        } else {
          controller.error(err);
        }
      }
    },

    async cancel(reason) {
      cancelled = true;
      stopHeartbeat();
      await opts.onDone?.({ kind: 'cancel', reason });
      // Propagate cancel upstream so the AI SDK stops the request.
      await reader.cancel(reason).catch(() => {
        /* upstream may already be closed — swallow */
      });
    },
  });
}

export function createSseResponse(
  stream: ReadableStream<string>,
  options?: { requestId?: string },
): Response {
  const encoder = new TextEncoder();
  const byteStream = stream.pipeThrough(
    new TransformStream<string, Uint8Array>({
      transform(chunk, controller) {
        controller.enqueue(encoder.encode(chunk));
      },
    }),
  );

  const headers: Record<string, string> = { ...SSE_RESPONSE_HEADERS };
  if (options?.requestId) {
    headers['x-request-id'] = options.requestId;
  }

  return new Response(byteStream, {
    status: 200,
    headers,
  });
}
