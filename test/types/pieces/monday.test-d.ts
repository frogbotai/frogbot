import { createMonday } from '@frogbotai/piece-monday';
import { expectTypeOf } from 'vitest';

const monday = createMonday({ auth: { apiToken: 'token' } });

const item = monday.createItem({
  input: { workspaceId: '1', boardId: '2', name: 'Task', columnValues: {} },
});

expectTypeOf<Parameters<typeof monday.createItem>[0]['input']>().toEqualTypeOf<{
  workspaceId: string;
  boardId: string;
  groupId?: string | undefined;
  name: string;
  columnValues: Record<string, unknown>;
  createLabelsIfMissing?: boolean | undefined;
}>();

expectTypeOf(item).toEqualTypeOf<Promise<Record<string, unknown>>>();

const _createItemRejectsCreateUpdateInput = () =>
  // @ts-expect-error createItem does not accept createUpdate input
  monday.createItem({ input: { itemId: '3', body: 'Done' } });

const items = monday.listBoardItems({ input: { workspaceId: '1', boardId: '2' } });

expectTypeOf(items).toEqualTypeOf<Promise<Record<string, unknown>[]>>();

expectTypeOf<keyof typeof monday.triggers>().toEqualTypeOf<'itemCreated' | 'columnUpdated'>();
expectTypeOf(monday.triggers.columnUpdated.type).toEqualTypeOf<'webhook'>();
