import type {
  CollectionAccess,
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionConfig,
  DocID,
} from 'frogbot';
import { APIError } from 'frogbot';

export const DATASETS = 'eval-datasets';
export const CASES = 'eval-cases';
export const RUNS = 'eval-runs';
export const RESULTS = 'eval-results';
export const WORKFLOW = 'frogbot-eval-run';

/** Set on the plugin's own writes to a run, so its hooks leave them alone. */
export const PLUGIN_WRITE = 'pluginEvalsWrite';

const group = 'Evals';

export type EvalRunInput = {
  run: DocID;
  userCollection?: string;
  userID?: DocID;
};

const runOwned = [
  'dataset',
  'agent',
  'model',
  'status',
  'total',
  'passed',
  'errored',
  'score',
  'scorerMeans',
  'startedAt',
  'finishedAt',
] as const;

export function runJobID(run: DocID): string {
  return `${WORKFLOW}:${run}`;
}

export function toID(value: unknown): DocID | undefined {
  if (typeof value === 'object' && value !== null) return (value as { id?: DocID }).id;

  return value as DocID | undefined;
}

const prepareRun: CollectionBeforeChangeHook = async ({
  data,
  operation,
  originalDoc,
  req,
  context,
}) => {
  if (context[PLUGIN_WRITE]) return data;

  if (operation === 'update') {
    const kept = originalDoc as Record<string, unknown>;

    return { ...data, ...Object.fromEntries(runOwned.map((name) => [name, kept[name]])) };
  }

  const datasetID = toID(data.dataset);
  const dataset =
    datasetID === undefined
      ? null
      : ((await req.frogbot.findByID({
          collection: DATASETS,
          id: datasetID,
          depth: 0,
          disableErrors: true,
          overrideAccess: true,
          req,
        })) as { agent?: string } | null);

  const agent = dataset?.agent ? req.frogbot.agents[dataset.agent] : undefined;

  if (!agent) throw new APIError(`Dataset '${String(datasetID)}' has no agent.`, 400);

  const model = typeof data.model === 'string' && data.model !== '' ? data.model : undefined;

  if (model !== undefined && !agent.config.model.options.some((option) => option === model)) {
    throw new APIError(`Model '${model}' isn't one of agent '${agent.slug}''s models.`, 400);
  }

  return {
    ...data,
    agent: agent.slug,
    model: model ?? null,
    status: 'queued',
    total: null,
    passed: null,
    errored: null,
    score: null,
    scorerMeans: null,
    startedAt: null,
    finishedAt: null,
  };
};

const queueRun: CollectionAfterChangeHook = async ({ doc, operation, req, context }) => {
  if (operation !== 'create' || context[PLUGIN_WRITE]) return doc;

  const id = (doc as { id: DocID }).id;
  const input: EvalRunInput = {
    run: id,
    ...(req.user ? { userCollection: String(req.user.collection), userID: req.user.id } : {}),
  };

  await req.frogbot.jobs.queue({
    workflow: WORKFLOW,
    input,
    jobId: runJobID(id),
    overrideAccess: true,
    req,
  });

  return doc;
};

export function createEvalCollections({
  agents,
  scorers,
  access,
}: {
  agents: readonly string[];
  scorers: readonly string[];
  access?: CollectionAccess;
}): CollectionConfig[] {
  const shared = { ...(access ? { access } : {}) };
  const readOnly = { readOnly: true };

  return [
    {
      slug: DATASETS,
      ...shared,
      labels: { singular: 'Eval dataset', plural: 'Eval datasets' },
      admin: { group, useAsTitle: 'name' },
      fields: [
        { name: 'name', type: 'text', required: true, unique: true },
        { name: 'agent', type: 'select', required: true, options: [...agents] },
        { name: 'scorers', type: 'select', hasMany: true, required: true, options: [...scorers] },
      ],
    },
    {
      slug: CASES,
      ...shared,
      labels: { singular: 'Eval case', plural: 'Eval cases' },
      admin: { group, useAsTitle: 'input' },
      fields: [
        {
          name: 'dataset',
          type: 'relationship',
          relationTo: DATASETS,
          required: true,
          index: true,
        },
        { name: 'input', type: 'textarea', required: true },
        { name: 'expected', type: 'textarea' },
        { name: 'expectedTools', type: 'text', hasMany: true },
        { name: 'metadata', type: 'json' },
      ],
    },
    {
      slug: RUNS,
      ...shared,
      labels: { singular: 'Eval run', plural: 'Eval runs' },
      admin: {
        group,
        views: [
          {
            type: 'list',
            defaultFields: ['dataset', 'model', 'status', 'score', 'passed', 'total', 'createdAt'],
          },
        ],
      },
      hooks: { beforeChange: [prepareRun], afterChange: [queueRun] },
      fields: [
        {
          name: 'dataset',
          type: 'relationship',
          relationTo: DATASETS,
          required: true,
          index: true,
        },
        { name: 'agent', type: 'text', admin: readOnly },
        {
          name: 'model',
          type: 'text',
          admin: { description: "One of the agent's models. Empty uses its default." },
        },
        {
          name: 'status',
          type: 'select',
          options: ['queued', 'running', 'completed', 'failed'],
          defaultValue: 'queued',
          index: true,
          admin: readOnly,
        },
        { name: 'total', type: 'number', admin: readOnly },
        { name: 'passed', type: 'number', admin: readOnly },
        { name: 'errored', type: 'number', admin: readOnly },
        { name: 'score', type: 'number', min: 0, max: 1, admin: readOnly },
        { name: 'scorerMeans', type: 'json', admin: readOnly },
        { name: 'startedAt', type: 'date', admin: readOnly },
        { name: 'finishedAt', type: 'date', admin: readOnly },
      ],
    },
    {
      slug: RESULTS,
      ...shared,
      authorship: false,
      labels: { singular: 'Eval result', plural: 'Eval results' },
      admin: { group },
      fields: [
        { name: 'run', type: 'relationship', relationTo: RUNS, required: true, index: true },
        { name: 'case', type: 'relationship', relationTo: CASES, index: true },
        { name: 'caseSnapshot', type: 'json', admin: readOnly },
        { name: 'output', type: 'textarea', admin: readOnly },
        { name: 'toolCalls', type: 'json', admin: readOnly },
        { name: 'usage', type: 'json', admin: readOnly },
        { name: 'durationMs', type: 'number', admin: readOnly },
        { name: 'error', type: 'textarea', admin: readOnly },
        {
          name: 'scores',
          type: 'array',
          admin: readOnly,
          fields: [
            { name: 'scorer', type: 'text', required: true },
            { name: 'score', type: 'number' },
            { name: 'reason', type: 'textarea' },
            { name: 'error', type: 'textarea' },
          ],
        },
      ],
    },
  ];
}
