import type { TrainingDataRecord } from './types.js';

const encoder = new TextEncoder();

async function* encodeRecords(
  records: AsyncIterable<TrainingDataRecord>,
): AsyncGenerator<Uint8Array> {
  for await (const record of records) {
    yield encoder.encode(`{"thread":${JSON.stringify(record.thread)},"messages":[`);
    for (let index = 0; index < record.messages.length; index += 1) {
      if (index > 0) yield encoder.encode(',');
      yield encoder.encode(JSON.stringify(record.messages[index]));
    }
    yield encoder.encode(']}\n');
  }
}

export function encodeTrainingData(
  records: AsyncIterable<TrainingDataRecord>,
): ReadableStream<Uint8Array> {
  const chunks = encodeRecords(records);

  return new ReadableStream({
    async cancel() {
      await chunks.return(undefined);
    },
    async pull(controller) {
      try {
        const chunk = await chunks.next();
        if (chunk.done) controller.close();
        else controller.enqueue(chunk.value);
      } catch (error) {
        controller.error(error);
      }
    },
  });
}
