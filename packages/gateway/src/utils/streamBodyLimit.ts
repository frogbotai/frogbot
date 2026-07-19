// Stream-based request body size enforcement.
//
// Hoisted from `routes/transcriptions/handler.ts` so every route (JSON and
// multipart alike) can cap request bodies that arrive without a
// Content-Length header (chunked transfer). The wrapped stream errors with a
// 413 `BodyTooLargeError` as soon as the running byte count crosses the cap,
// so the gateway never buffers more than `maxBodyBytes` (+ one chunk).

import { BodyTooLargeError } from '../errors/gatewayError.js';

export function withStreamBodyLimit(request: Request, maxBodyBytes: number): Request {
  if (!request.body) {
    return request;
  }

  return new Request(request, {
    body: enforceStreamBodyLimit(request.body, maxBodyBytes),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

export function enforceStreamBodyLimit(
  body: ReadableStream<Uint8Array>,
  maxBodyBytes: number,
): ReadableStream<Uint8Array> {
  const reader = body.getReader();
  let bytes = 0;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }

      bytes += value.byteLength;
      if (bytes > maxBodyBytes) {
        controller.error(new BodyTooLargeError({
          message: `Request body exceeds ${maxBodyBytes} bytes`,
          param: '(body)',
        }));
        return;
      }

      controller.enqueue(value);
    },
    cancel: () => reader.cancel(),
  });
}
