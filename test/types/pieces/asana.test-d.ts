import { createAsana } from '@frogbotai/piece-asana';
import { expectTypeOf } from 'vitest';

const asana = createAsana({ auth: { accessToken: 'token' } });

createAsana({ oauth: { clientId: 'client', clientSecret: 'secret' } });

expectTypeOf<Parameters<typeof asana.createTask>[0]['input']>().toEqualTypeOf<{
  workspaceGid: string;
  projectGid: string;
  name: string;
  notes: string;
  dueOn?: string;
  tags?: string[];
  assignee?: string;
}>();

expectTypeOf<Parameters<typeof asana.listProjects>[0]['input']>().toEqualTypeOf<{
  workspaceGid: string;
  teamGid?: string;
  archived?: boolean;
  limit?: number;
  cursor?: string;
}>();

const _page = asana.listTasks({ input: { projectGid: '1203' } });

expectTypeOf<Awaited<typeof _page>['pagination']['nextCursor']>().toEqualTypeOf<string | null>();
expectTypeOf<Awaited<typeof _page>['data'][number]['gid']>().toEqualTypeOf<string>();

// @ts-expect-error createTask needs a project
void asana.createTask({ input: { workspaceGid: '1', name: 'Ship', notes: '' } });

expectTypeOf<keyof typeof asana.triggers>().toEqualTypeOf<
  'taskCreated' | 'taskChanged' | 'taskCompleted' | 'commentAdded' | 'projectChanged'
>();

expectTypeOf(asana.triggers.taskCreated.type).toEqualTypeOf<'webhook'>();

expectTypeOf(asana.triggers.projectChanged.type).toEqualTypeOf<'polling'>();
