import type { AIFieldArgs, AISelectFieldArgs, FrogBotRequest, ModelId, RowField } from 'frogbot';
import { aiField } from 'frogbot';
import type { AIFieldStatus, AIKind } from 'frogbot/fields';
import { aiFieldPaths, isAIFieldInputSet } from 'frogbot/fields';
import { expectTypeOf } from 'vitest';

expectTypeOf(aiField).returns.toEqualTypeOf<RowField>();
expectTypeOf<AIFieldArgs['inputs']>().toEqualTypeOf<string[]>();
expectTypeOf<AIFieldArgs['prompt']>().toEqualTypeOf<string>();
expectTypeOf<AIFieldArgs['model']>().toEqualTypeOf<ModelId | undefined>();
expectTypeOf<AISelectFieldArgs['inputs']>().toEqualTypeOf<string[]>();
expectTypeOf<AISelectFieldArgs['prompt']>().toEqualTypeOf<string>();
expectTypeOf<AISelectFieldArgs['model']>().toEqualTypeOf<ModelId | undefined>();
expectTypeOf<AIFieldStatus>().toEqualTypeOf<'pending' | 'done' | 'error' | 'manual'>();

expectTypeOf<AIKind>().toEqualTypeOf<{
  type: 'ai';
  inputs: string[];
  prompt: string;
  model?: string;
}>();

expectTypeOf(aiFieldPaths).returns.toEqualTypeOf<{ status: string; error: string }>();
expectTypeOf(isAIFieldInputSet).returns.toEqualTypeOf<boolean>();

aiField({
  name: 'summary',
  inputs: ['title', 'notes'],
  prompt: 'Summarize this record in one sentence.',
  model: 'openai/gpt-5-nano',
  label: 'Summary',
  localized: true,
  maxLength: 200,
  admin: { position: 'sidebar', width: '50%' },
  validate: (value, { req }) => {
    expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

    return true;
  },
  hooks: {
    beforeChange: [
      ({ req, value }) => {
        expectTypeOf(req).toEqualTypeOf<FrogBotRequest>();

        return value;
      },
    ],
  },
});

// @ts-expect-error inputs is required
aiField({ name: 'summary', prompt: 'Summarize.' });

// @ts-expect-error prompt is required
aiField({ name: 'summary', inputs: ['title'] });

// @ts-expect-error AI text fields hold one value
aiField({ name: 'summary', inputs: ['title'], prompt: 'Summarize.', hasMany: true });

// @ts-expect-error AI text fields can't be required
aiField({ name: 'summary', inputs: ['title'], prompt: 'Summarize.', required: true });

// @ts-expect-error FrogBot stores the AI value
aiField({ name: 'summary', inputs: ['title'], prompt: 'Summarize.', virtual: true });

// @ts-expect-error the AI value is shown and returned
aiField({ name: 'summary', inputs: ['title'], prompt: 'Summarize.', hidden: true });

// @ts-expect-error FrogBot stores the AI value
aiField({ name: 'type', inputs: ['notes'], prompt: 'Classify.', options: ['bug'], virtual: true });

// @ts-expect-error AI select fields can't be required
aiField({ name: 'type', inputs: ['notes'], prompt: 'Classify.', options: ['bug'], required: true });

aiField({
  name: 'labels',
  inputs: ['notes'],
  prompt: 'Label.',
  options: ['ui'],
  hasMany: true,
  // @ts-expect-error AI multiple selects can't be required
  required: false,
});

// @ts-expect-error AI fields run without an agent
aiField({ name: 'summary', inputs: ['title'], prompt: 'Summarize.', agent: 'writer' });

// @ts-expect-error the factory sets the type
aiField({ name: 'summary', inputs: ['title'], prompt: 'Summarize.', type: 'text' });

aiField({
  name: 'type',
  inputs: ['notes'],
  prompt: 'Classify.',
  options: [{ label: 'Bug', value: 'bug', color: 'red' }, 'question'],
});

aiField({
  name: 'labels',
  inputs: ['notes'],
  prompt: 'Label.',
  options: ['ui', 'api', 'docs'],
  hasMany: true,
  admin: { position: 'sidebar', isClearable: false },
});

aiField({
  name: 'labels',
  inputs: ['notes'],
  prompt: 'Label.',
  // @ts-expect-error option colours are checked
  options: [{ label: 'UI', value: 'ui', color: 'magenta' }],
});

// @ts-expect-error select AI fields need inputs
aiField({ name: 'type', prompt: 'Classify.', options: ['bug'] });

// @ts-expect-error hasMany needs options
aiField({ name: 'labels', inputs: ['notes'], prompt: 'Label.', hasMany: true });

// @ts-expect-error a text AI field has no options
aiField({ name: 'summary', inputs: ['title'], prompt: 'Summarize.', options: [], maxLength: 10 });
