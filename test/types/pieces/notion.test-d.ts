import { createNotion } from '@frogbotai/piece-notion';
import { expectTypeOf } from 'vitest';

const notion = createNotion({ auth: { accessToken: 'token' } });

const _comment = notion.addComment({ input: { pageId: 'page', commentText: 'Looks good' } });

expectTypeOf<Parameters<typeof notion.addComment>[0]['input']>().toEqualTypeOf<{
  pageId: string;
  commentText: string;
}>();

expectTypeOf<Awaited<typeof _comment>['id']>().toEqualTypeOf<string>();
expectTypeOf<Awaited<typeof _comment>['created_time']>().toEqualTypeOf<string>();

const _addCommentRejectsRetrieveDatabaseInput = () =>
  // @ts-expect-error addComment does not accept retrieveDatabase input
  notion.addComment({ input: { databaseId: 'database' } });

expectTypeOf<keyof typeof notion.triggers>().toEqualTypeOf<
  'newDatabaseItem' | 'updatedDatabaseItem' | 'newComment' | 'updatedPage'
>();

expectTypeOf(notion.triggers.updatedDatabaseItem.type).toEqualTypeOf<'polling'>();
