import type { FrogBot } from 'frogbot';

import { encodeTrainingData } from './encodeTrainingData.js';
import { readTrainingData } from './readTrainingData.js';
import type { ReadTrainingDataOptions } from './types.js';

export function exportTrainingData(
  frogbot: FrogBot,
  options: ReadTrainingDataOptions = {},
): ReadableStream<Uint8Array> {
  return encodeTrainingData(readTrainingData(frogbot, options));
}
