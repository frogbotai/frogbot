export const dynamic = 'force-dynamic';

/** `?chunks=<n>` chunks (ten by default), one every half second, so a swap can happen while it streams. */
export function GET(request: Request) {
  const chunks = Number(new URL(request.url).searchParams.get('chunks') ?? 10);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (let i = 0; i < chunks; i++) {
        controller.enqueue(encoder.encode(`chunk ${i}\n`));
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      controller.close();
    },
  });

  return new Response(body, { headers: { 'content-type': 'text/plain' } });
}
