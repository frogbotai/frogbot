import type { Where } from '../types/payload.js';
import type { FrogbotRequest } from '../types/request.js';

export type TrainingDataDocument = Record<string, unknown>;

export type TrainingDataRecord = {
  thread: TrainingDataDocument;
  messages: TrainingDataDocument[];
};

export type ReadTrainingDataOptions = {
  where?: Where;
  pageSize?: number;
  req?: FrogbotRequest;
  overrideAccess?: boolean;
};
