import { describe, expect, it } from 'vitest';

import { aiField } from '../../../../../packages/frogbot/src/fields/baseFields/ai/index.js';
import { withAIFieldSelect } from '../../../../../packages/frogbot/src/fields/baseFields/ai/select.js';
import type { Field } from '../../../../../packages/frogbot/src/fields/config/types.js';

const fields: Field[] = [
  { name: 'title', type: 'text' },
  { name: 'notes', type: 'textarea' },
  aiField({ name: 'summary', inputs: ['title', 'notes'], prompt: 'Summarize.' }),
];

const args = (select?: Record<string, boolean>) =>
  ({ operation: 'read', req: {}, select }) as Parameters<
    NonNullable<ReturnType<typeof withAIFieldSelect>>
  >[0];

describe('withAIFieldSelect', () => {
  it("adds a selected AI field's status, error and inputs", () => {
    const select = withAIFieldSelect(fields);

    expect(select?.(args({ summary: true }))).toEqual({
      summary: true,
      _summary_status: true,
      _summary_error: true,
      title: true,
      notes: true,
    });
  });

  it('leaves a select without the AI field, an exclude select and no select alone', () => {
    const select = withAIFieldSelect(fields);

    expect(select?.(args({ title: true }))).toEqual({ title: true });
    expect(select?.(args({ notes: false }))).toEqual({ notes: false });
    expect(select?.(args())).toBeUndefined();
  });
});
