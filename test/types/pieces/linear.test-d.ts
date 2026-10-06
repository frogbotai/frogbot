import { createLinear } from '@frogbotai/piece-linear';
import { expectTypeOf } from 'vitest';

const linear = createLinear({ auth: { apiKey: 'key' } });

const _comment = linear.createComment({
  input: { teamId: 'team', issueId: 'issue', body: 'Looks good.' },
});

expectTypeOf<Parameters<typeof linear.createComment>[0]['input']>().toEqualTypeOf<{
  teamId: string;
  issueId: string;
  body: string;
}>();
expectTypeOf<Awaited<typeof _comment>['success']>().toEqualTypeOf<boolean>();

const _createCommentRejectsRawGraphqlQueryInput = () =>
  // @ts-expect-error createComment does not accept rawGraphqlQuery input
  linear.createComment({ input: { query: '{ viewer { id } }' } });

expectTypeOf<keyof typeof linear.triggers>().toEqualTypeOf<
  | 'commentCreated'
  | 'issueCreated'
  | 'issueUpdated'
  | 'issueRemoved'
  | 'projectCreated'
  | 'projectUpdated'
  | 'projectRemoved'
>();
expectTypeOf(linear.triggers.commentCreated.type).toEqualTypeOf<'webhook'>();
