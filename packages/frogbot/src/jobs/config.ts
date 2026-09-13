import type { Field, JobsConfig as PayloadJobsConfig } from 'payload';

import { DEFAULT_JOB_LEASE_DURATION, withJobLease } from './lease.js';
import { JOB_SWEEP_TASK_SLUG, sweepJobLeases } from './sweep.js';
import type { JobsConfig } from './types.js';

function removeOwnedFields(fields: Field[]): Field[] {
  return fields.flatMap((field): Field[] => {
    if ('name' in field && field.name) {
      return ['jobId', 'leaseUntil', 'leaseOwner'].includes(field.name) ? [] : [field];
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

export function resolveJobsConfig(
  jobs: JobsConfig = {},
): JobsConfig & { leaseDuration: number; runHooks: false; depth: 0 } {
  const { runHooks, depth } = jobs as PayloadJobsConfig;

  if (runHooks) {
    throw new Error('FrogBot jobs.runHooks is unsupported because job claims must be atomic.');
  }

  if (depth && depth > 0) {
    throw new Error('FrogBot jobs.depth must be 0 because job claims must be atomic.');
  }

  const leaseDuration = jobs.leaseDuration ?? DEFAULT_JOB_LEASE_DURATION;

  if (!Number.isSafeInteger(leaseDuration) || leaseDuration < 5 || leaseDuration > 2_147_483_647) {
    throw new Error(
      'FrogBot jobs.leaseDuration must be an integer from 5 to 2147483647 milliseconds.',
    );
  }

  if (jobs.tasks?.some(({ slug }) => slug === JOB_SWEEP_TASK_SLUG)) {
    throw new Error(`FrogBot job task '${JOB_SWEEP_TASK_SLUG}' is reserved.`);
  }

  const fields: Field[] = [
    { name: 'jobId', type: 'text', unique: true, required: false },
    { name: 'leaseUntil', type: 'date', index: true, admin: { readOnly: true } },
    {
      name: 'leaseOwner',
      type: 'text',
      hidden: true,
      access: { create: () => false, read: () => false, update: () => false },
      admin: { hidden: true },
    },
  ];

  return {
    ...jobs,
    runHooks: false,
    depth: 0,
    leaseDuration,
    tasks: [
      ...(jobs.tasks ?? []),
      {
        slug: JOB_SWEEP_TASK_SLUG,
        schedule: [{ cron: '* * * * *', queue: 'default' }],
        handler: async ({ req }) => {
          await sweepJobLeases({ req });

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
                    withJobLease({
                      payload: req.payload,
                      req,
                      leaseDuration,
                      run: async () => endpoint.handler(req),
                    }),
                }
              : endpoint,
          ),
      };
    },
  };
}
