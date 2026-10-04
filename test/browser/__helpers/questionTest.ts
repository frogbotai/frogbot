import { test as base } from '@playwright/test';

import { modelPort } from '../fixtures/question/shared';

export type QuestionOptions = { modelPort: number };

export const test = base.extend<object, QuestionOptions>({
  modelPort: [modelPort, { option: true, scope: 'worker' }],
});
