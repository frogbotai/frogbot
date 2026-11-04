import { createJira } from '@frogbotai/piece-jira';
import { expectTypeOf } from 'vitest';

const jira = createJira({
  siteUrl: 'https://acme.atlassian.net',
  auth: { email: 'dana@acme.com', apiToken: 'token' },
});

createJira({ auth: { accessToken: 'token' } });

const _comment = jira.addComment({ input: { issueKey: 'OPS-12', body: '**Blocked** by `api`' } });

expectTypeOf<Awaited<typeof _comment>['id']>().toEqualTypeOf<string>();

void jira.addComment({
  input: { issueKey: 'OPS-12', body: { type: 'doc', version: 1, content: [{ type: 'rule' }] } },
});

expectTypeOf<Parameters<typeof jira.assignIssue>[0]['input']>().toEqualTypeOf<{
  issueKey: string;
  assignee: string;
}>();

const _assigned = jira.assignIssue({ input: { issueKey: 'OPS-1', assignee: 'acc-1' } });

expectTypeOf<Awaited<typeof _assigned>>().toEqualTypeOf<{ success: true }>();

// @ts-expect-error addComment needs a body
void jira.addComment({ input: { issueKey: 'OPS-12' } });

const app = { clientId: 'client', clientSecret: 'secret' };

createJira({ oauth: app, scopes: ({ defaultScopes }) => [...defaultScopes, 'read:jira-user'] });

// @ts-expect-error manage:jira-configuration is not a Jira scope name
createJira({ oauth: app, scopes: ['manage:jira-configuration'] });

expectTypeOf<keyof typeof jira.triggers>().toEqualTypeOf<
  | 'issueCreated'
  | 'issueUpdated'
  | 'issueStatusChanged'
  | 'commentAdded'
  | 'issueAssigned'
  | 'attachmentAdded'
  | 'issueTypeCreated'
  | 'projectCreated'
  | 'priorityCreated'
>();

expectTypeOf(jira.triggers.issueCreated.type).toEqualTypeOf<'polling'>();
