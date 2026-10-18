import type { Field, JobsConfig as PayloadJobsConfig } from 'payload';

import { withJobRun } from './run.js';
import type { JobsConfig } from './types.js';
import { sweepWaitpoints } from './waitpoints/operations.js';
import type { WaitpointOptions } from './waitpoints/types.js';
import { wrapWorkflow } from './waitpoints/workflow.js';

export const WAITPOINT_SWEEP_TASK_SLUG = 'frogbot-sweep-waitpoints';

const DEFAULT_WAITPOINT_EXPIRY = 7 * 24 * 60 * 60 * 1000;
const MAX_WAITPOINT_EXPIRY = 30 * 24 * 60 * 60 * 1000;

function removeOwnedFields(fields: Field[]): Field[] {
  return fields.flatMap((field): Field[] => {
    if ('name' in field && field.name) {
      return ['jobId', 'waitpoint'].includes(field.name) ? [] : [field];
    }

    if ('fields' in field) return [{ ...field, fields: removeOwnedFields(field.fields) }];

    if (field.type === 'tabs') {
      return [
        {
          ...field,
          tabs: field.tabs.map((tab) =>
            'name' in tab && tab.name ? tab : { ...tab, fields: removeOwnedFields(tab.fields) },
          ),
        },
      ];
    }

    return [field];
  });
}

export function resolveJobsConfig(jobs: JobsConfig = {}): PayloadJobsConfig & {
  waitpoints: WaitpointOptions;
} {
  if (jobs.tasks?.some(({ slug }) => slug === WAITPOINT_SWEEP_TASK_SLUG)) {
    throw new Error(`FrogBot job task '${WAITPOINT_SWEEP_TASK_SLUG}' is reserved.`);
  }

  const waitpoints = {
    defaultExpiresIn: jobs.waitpoints?.defaultExpiresIn ?? DEFAULT_WAITPOINT_EXPIRY,
    maxExpiresIn: jobs.waitpoints?.maxExpiresIn ?? MAX_WAITPOINT_EXPIRY,
  };

  for (const [name, value] of Object.entries(waitpoints)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(
        `FrogBot jobs.waitpoints.${name} must be a positive integer in milliseconds.`,
      );
    }
  }

  if (waitpoints.defaultExpiresIn > waitpoints.maxExpiresIn) {
    throw new Error('FrogBot jobs.waitpoints.defaultExpiresIn must not exceed maxExpiresIn.');
  }

  if (Date.now() + waitpoints.maxExpiresIn > Date.parse('9999-12-31T23:59:59.999Z')) {
    throw new Error(
      'FrogBot jobs.waitpoints.maxExpiresIn must keep expiry on or before 9999-12-31T23:59:59.999Z.',
    );
  }

  const fields: Field[] = [
    { name: 'jobId', type: 'text', required: false },
    {
      name: 'waitpoint',
      type: 'json',
      hidden: true,
      access: { create: () => false, read: () => false, update: () => false },
      admin: { hidden: true },
    },
  ];

  return {
    ...jobs,
    waitpoints,
    workflows: jobs.workflows?.map((workflow) => wrapWorkflow({ workflow, config: waitpoints })),
    tasks: [
      ...(jobs.tasks ?? []),
      {
        slug: WAITPOINT_SWEEP_TASK_SLUG,
        interfaceName: 'TaskFrogBotSweepWaitpoints',
        schedule: [{ cron: '* * * * *', queue: 'default' }],
        handler: async ({ req }) => {
          await sweepWaitpoints({ req });

          return { output: {} };
        },
      },
    ],
    jobsCollectionOverrides: ({ defaultJobsCollection }) => {
      const collection =
        jobs.jobsCollectionOverrides?.({ defaultJobsCollection }) ?? defaultJobsCollection;

      return {
        ...collection,
        fields: [...removeOwnedFields(collection.fields), ...fields],
        endpoints:
          collection.endpoints &&
          collection.endpoints.map((endpoint) =>
            endpoint.path === '/run' && endpoint.method === 'get'
              ? {
                  ...endpoint,
                  handler: (req) =>
                    withJobRun({ payload: req.payload, run: async () => endpoint.handler(req) }),
                }
              : endpoint,
          ),
      };
    },
  };
}
