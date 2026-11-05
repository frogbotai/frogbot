import type { AgentModelId, DocID, FrogBot, FrogBotRequest, WorkflowConfig } from 'frogbot';

import type { EvalRunInput } from './collections.js';
import { CASES, DATASETS, PLUGIN_WRITE, RUNS, toID, WORKFLOW } from './collections.js';
import type { EvalsResolvedOptions } from './options.js';
import type { CaseOutcome, EvalCase } from './runCase.js';
import { runCase } from './runCase.js';
import type { Scorer } from './scorers.js';

/** Retries of a run whose result writes failed; each retry skips the cases already saved. */
export const RUN_RETRIES = 2;

type RunDoc = {
  id: DocID;
  dataset: unknown;
  model?: string | null;
  startedAt?: string | null;
};

type DatasetDoc = { id: DocID; agent: string; scorers?: string[] | null };

export type RunTotals = {
  total: number;
  passed: number;
  errored: number;
  score: number | null;
  scorerMeans: Record<string, number>;
};

export function summarize(outcomes: readonly CaseOutcome[], scorers: readonly string[]): RunTotals {
  const total = outcomes.length;
  const scorerMeans = Object.fromEntries(
    scorers.map((name) => [
      name,
      total === 0
        ? 0
        : outcomes.reduce((sum, outcome) => sum + (outcome.scores[name] ?? 0), 0) / total,
    ]),
  );

  const means = Object.values(scorerMeans);

  return {
    total,
    errored: outcomes.filter(({ errored }) => errored).length,
    passed: outcomes.filter(
      (outcome) => !outcome.errored && scorers.every((name) => outcome.scores[name] === 1),
    ).length,
    score:
      total === 0 || means.length === 0
        ? null
        : means.reduce((sum, mean) => sum + mean, 0) / means.length,
    scorerMeans,
  };
}

async function runRequest(
  frogbot: FrogBot,
  { run, userCollection, userID }: EvalRunInput,
): Promise<FrogBotRequest> {
  const context = { evalRun: run };

  if (!userCollection || userID === undefined) return frogbot.createRequest({ context });

  const user = await frogbot.findByID({
    collection: userCollection,
    id: userID,
    depth: 0,
    overrideAccess: true,
  });

  return frogbot.createRequest({
    user: { ...user, collection: userCollection },
    context,
  });
}

function pickScorers(dataset: DatasetDoc, scorers: Record<string, Scorer>) {
  return (dataset.scorers ?? []).map((name) => {
    const scorer = scorers[name];

    if (!scorer) throw new Error(`[plugin-evals] Scorer '${name}' isn't in evalsPlugin's scorers.`);

    return [name, scorer] as const;
  });
}

export function createEvalWorkflow(options: EvalsResolvedOptions): WorkflowConfig<EvalRunInput> {
  return {
    slug: WORKFLOW,
    label: 'Eval run',
    retries: RUN_RETRIES,
    handler: async ({ job, req: { frogbot }, foreach }) => {
      const runID = job.input.run;
      const writeRun = (data: Record<string, unknown>) =>
        frogbot.update({
          collection: RUNS,
          id: runID,
          data: data,
          depth: 0,
          overrideAccess: true,
          context: { [PLUGIN_WRITE]: true },
        });

      try {
        const req = await runRequest(frogbot, job.input);
        const overrideAccess = !req.user;
        const run = (await frogbot.findByID({
          collection: RUNS,
          id: runID,
          depth: 0,
          overrideAccess: true,
        })) as RunDoc;

        await writeRun({
          status: 'running',
          startedAt: run.startedAt ?? new Date().toISOString(),
          finishedAt: null,
        });

        const dataset = (await frogbot.findByID({
          collection: DATASETS,
          id: toID(run.dataset)!,
          depth: 0,
          overrideAccess,
          req,
        })) as DatasetDoc;

        const agent = frogbot.agents[dataset.agent];

        if (!agent) throw new Error(`[plugin-evals] No agent '${dataset.agent}'.`);

        const scorers = pickScorers(dataset, options.scorers);
        const { docs } = await frogbot.find({
          collection: CASES,
          where: { dataset: { equals: dataset.id } },
          sort: ['createdAt', 'id'],
          depth: 0,
          pagination: false,
          overrideAccess,
          req,
        });

        const model = (run.model || undefined) as AgentModelId | undefined;
        const outcomes = await foreach('case', docs as EvalCase[], {
          key: (evalCase) => String(evalCase.id),
          concurrency: options.concurrency,
          task: async ({ item }) => ({
            output: await runCase({
              run: runID,
              evalCase: item,
              agent,
              scorers,
              req,
              overrideAccess,
              model,
            }),
          }),
        });

        await writeRun({
          status: 'completed',
          ...summarize(
            outcomes,
            scorers.map(([name]) => name),
          ),
          finishedAt: new Date().toISOString(),
        });
      } catch (error) {
        await writeRun({ status: 'failed', finishedAt: new Date().toISOString() }).catch(
          (writeError: unknown) => {
            frogbot.logger.error(
              { error: writeError },
              '[plugin-evals] Failed to mark run failed.',
            );
          },
        );

        throw error;
      }
    },
  };
}
