import type { FrogBotRequest, Where } from 'frogbot';

export type TrainingDataDocument = Record<string, unknown>;

export type TrainingDataRecord = {
  chat: TrainingDataDocument;
  messages: TrainingDataDocument[];
};

export type ReadTrainingDataOptions = {
  where?: Where;
  pageSize?: number;
  req?: FrogBotRequest;
  overrideAccess?: boolean;
};
