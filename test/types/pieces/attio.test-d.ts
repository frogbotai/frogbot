import { createAttio } from '@frogbotai/piece-attio';
import { expectTypeOf } from 'vitest';

const attio = createAttio({ auth: { accessToken: 'token' } });

const note = attio.createNote({
  input: { parentObject: 'people', parentRecordId: 'record', title: 'Call', content: 'Notes' },
});

expectTypeOf<Parameters<typeof attio.createNote>[0]['input']>().toEqualTypeOf<{
  parentObject: string;
  parentRecordId: string;
  title: string;
  format?: 'plaintext' | 'markdown' | undefined;
  content: string;
}>();

expectTypeOf(note).toEqualTypeOf<Promise<Record<string, unknown>>>();

const _createNoteRejectsGetTaskInput = () =>
  // @ts-expect-error createNote does not accept getTask input
  attio.createNote({ input: { taskId: 'task' } });

const deleted = attio.deleteTask({ input: { taskId: 'task' } });

expectTypeOf(deleted).toEqualTypeOf<Promise<{ success: true }>>();

expectTypeOf<keyof typeof attio.triggers>().toEqualTypeOf<
  | 'recordCreated'
  | 'recordUpdated'
  | 'listEntryCreated'
  | 'listEntryUpdated'
  | 'callRecordingCreated'
>();

expectTypeOf(attio.triggers.recordUpdated.type).toEqualTypeOf<'webhook'>();
