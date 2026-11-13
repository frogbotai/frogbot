import { hasFrogBot } from 'frogbot/internal';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bootJobsFixture } from './fixture.js';

type Seen = { event: string; frogbot: boolean };

const seen: Seen[] = [];

let fixture: Awaited<ReturnType<typeof bootJobsFixture>>;

beforeAll(async () => {
  fixture = await bootJobsFixture({
    jobs: {
      tasks: [
        {
          slug: 'probe',
          handler: ({ req }) => {
            seen.push({ event: 'task', frogbot: typeof req.frogbot?.find === 'function' });

            return { output: {} };
          },
          onSuccess: ({ req }) => {
            seen.push({ event: 'onSuccess', frogbot: typeof req.frogbot?.find === 'function' });
          },
        },
        {
          slug: 'probe-fails',
          retries: 0,
          handler: () => {
            throw new Error('probe failure');
          },
          onFail: ({ req }) => {
            seen.push({ event: 'onFail', frogbot: typeof req.frogbot?.find === 'function' });
          },
        },
      ],
      workflows: [
        {
          slug: 'probe-workflow',
          handler: async ({ req, inlineTask }) => {
            seen.push({ event: 'workflow', frogbot: typeof req.frogbot?.find === 'function' });

            await inlineTask('step', {
              task: ({ req: stepReq }) => {
                seen.push({
                  event: 'inlineTask',
                  frogbot: hasFrogBot(stepReq) && typeof stepReq.frogbot.find === 'function',
                });

                return { output: {} };
              },
            });
          },
        },
      ],
    },
  });
});

afterAll(async () => {
  await fixture?.shutdown();
});

async function run(args: { task: string } | { workflow: string }) {
  seen.length = 0;

  const job = await fixture.frogbot.jobs.queue({ ...args, input: {}, overrideAccess: true });

  await fixture.frogbot.jobs.runByID({ id: job.id, overrideAccess: true });

  return [...seen];
}

describe('req.frogbot in job handlers', () => {
  it('is set in a task handler and onSuccess', async () => {
    expect(await run({ task: 'probe' })).toEqual([
      { event: 'task', frogbot: true },
      { event: 'onSuccess', frogbot: true },
    ]);
  });

  it('is set in onFail', async () => {
    expect(await run({ task: 'probe-fails' })).toEqual([{ event: 'onFail', frogbot: true }]);
  });

  it('is set in a workflow handler and its inlineTask', async () => {
    expect(await run({ workflow: 'probe-workflow' })).toEqual([
      { event: 'workflow', frogbot: true },
      { event: 'inlineTask', frogbot: true },
    ]);
  });
});
