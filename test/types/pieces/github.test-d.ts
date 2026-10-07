import { createGithub } from '@frogbotai/piece-github';
import { expectTypeOf } from 'vitest';

const github = createGithub({ auth: { accessToken: 'token' } });

const _gist = github.createGist({ input: { filename: 'notes.md', content: '# Notes' } });

expectTypeOf<Parameters<typeof github.createGist>[0]['input']>().toEqualTypeOf<{
  description?: string | undefined;
  public?: boolean | undefined;
  filename: string;
  content: string;
}>();

expectTypeOf<Awaited<typeof _gist>['html_url']>().toEqualTypeOf<string>();

const _createGistRejectsGetIssueInput = () =>
  // @ts-expect-error createGist does not accept getIssue input
  github.createGist({ input: { repository: 'frogbotai/frogbot', issueNumber: 97 } });

expectTypeOf<keyof typeof github.triggers>().toEqualTypeOf<
  | 'pullRequestActivity'
  | 'starActivity'
  | 'issueActivity'
  | 'push'
  | 'discussionActivity'
  | 'discussionCommentActivity'
  | 'branchCreated'
  | 'collaboratorAdded'
  | 'labelCreated'
  | 'milestoneCreated'
  | 'releaseCreated'
  | 'commitCreated'
  | 'reviewRequested'
  | 'mentioned'
>();

expectTypeOf(github.triggers.mentioned.type).toEqualTypeOf<'webhook'>();
