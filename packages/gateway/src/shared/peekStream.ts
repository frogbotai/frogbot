export type PeekedStream<T> = {
  first: T;
  stream: ReadableStream<T>;
};

export async function peekStream<T>(stream: ReadableStream<T>): Promise<PeekedStream<T> | undefined> {
  const reader = stream.getReader();
  const { done, value } = await reader.read();

  if (done) {
    reader.releaseLock();
    return undefined;
  }

  return {
    first: value,
    stream: new ReadableStream<T>({
      start(controller) {
        controller.enqueue(value);
      },
      async pull(controller) {
        const next = await reader.read();
        if (next.done) {
          reader.releaseLock();
          controller.close();
          return;
        }
        controller.enqueue(next.value);
      },
      async cancel(reason) {
        await reader.cancel(reason);
        reader.releaseLock();
      },
    }),
  };
}
