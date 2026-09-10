export async function* chunkGenerator<T>(src: AsyncIterable<T>, size: number): AsyncGenerator<T[]> {
  let buffer: T[] = [];

  for await (const item of src) {
    buffer.push(item);
    if (buffer.length >= size) {
      yield buffer;
      buffer = [];
    }
  }

  if (buffer.length > 0) yield buffer;
}
