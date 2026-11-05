import type { CLICommand, DocID, FrogBot } from 'frogbot';

import { DATASETS, runJobID, RUNS } from './collections.js';
import type { RunTotals } from './workflow.js';
import { RUN_RETRIES } from './workflow.js';

export type EvalsRunArgs = {
  dataset: string;
  model?: string;
  minScore?: number;
};

const usage = 'Usage: frogbot evals:run <dataset> [--model <id>] [--min-score <0-1>]';

export function parseEvalsRunArgs(args: readonly string[]): EvalsRunArgs {
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }

    const [name, inline] = arg.slice(2).split(/=(.*)/s, 2) as [string, string | undefined];
    const value = inline ?? args[++index];

    if (name !== 'model' && name !== 'min-score') {
      throw new Error(`Unknown flag --${name}. ${usage}`);
    }

    if (value === undefined || value === '') throw new Error(`--${name} needs a value. ${usage}`);

    flags[name] = value;
  }

  if (positional.length !== 1) throw new Error(usage);

  const minScore = flags['min-score'] === undefined ? undefined : Number(flags['min-score']);

  if (minScore !== undefined && !(minScore >= 0 && minScore <= 1)) {
    throw new Error(`--min-score must be a number from 0 to 1. ${usage}`);
  }

  return {
    dataset: positional[0],
    ...(flags.model === undefined ? {} : { model: flags.model }),
    ...(minScore === undefined ? {} : { minScore }),
  };
}

async function findDataset(frogbot: FrogBot, nameOrID: string): Promise<DocID> {
  const { docs } = await frogbot.find({
    collection: DATASETS,
    where: { name: { equals: nameOrID } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  const byName = (docs[0] as { id: DocID } | undefined)?.id;

  if (byName !== undefined) return byName;

  const byID = await frogbot
    .findByID({
      collection: DATASETS,
      id: nameOrID,
      depth: 0,
      disableErrors: true,
      overrideAccess: true,
    })
    .catch(() => null);

  if (!byID) throw new Error(`No eval dataset named or with ID '${nameOrID}'.`);

  return (byID as { id: DocID }).id;
}

type RunResult = RunTotals & { id: DocID; status: string };

async function readRun(frogbot: FrogBot, id: DocID): Promise<RunResult> {
  return (await frogbot.findByID({
    collection: RUNS,
    id,
    depth: 0,
    overrideAccess: true,
  })) as RunResult;
}

async function waitingJob(frogbot: FrogBot, run: DocID): Promise<DocID | undefined> {
  const { docs } = await frogbot.find({
    collection: 'payload-jobs',
    where: {
      and: [
        { jobId: { equals: runJobID(run) } },
        { completedAt: { exists: false } },
        { hasError: { not_equals: true } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });

  return (docs[0] as { id: DocID } | undefined)?.id;
}

function format(score: number | null | undefined): string {
  return typeof score === 'number' ? score.toFixed(3) : '—';
}

/** `frogbot evals:run`: runs a dataset with no user, in this process, and fails below `--min-score`. */
export const evalsRunCommand: CLICommand = async ({ args, getFrogBot }) => {
  const parsed = parseEvalsRunArgs(args);
  const frogbot = await getFrogBot();
  const dataset = await findDataset(frogbot, parsed.dataset);

  const created = (await frogbot.create({
    collection: RUNS,
    data: { dataset, ...(parsed.model ? { model: parsed.model } : {}) },
    depth: 0,
    overrideAccess: true,
  })) as { id: DocID };

  for (let attempt = 0; attempt <= RUN_RETRIES; attempt++) {
    const job = await waitingJob(frogbot, created.id);

    if (job === undefined) break;

    await frogbot.jobs.runByID({ id: job, overrideAccess: true, silent: true });
  }

  const run = await readRun(frogbot, created.id);

  for (const [name, mean] of Object.entries(run.scorerMeans ?? {})) {
    process.stdout.write(`${name}: ${format(mean)}\n`);
  }

  process.stdout.write(
    `score: ${format(run.score)} · ${run.passed ?? 0}/${run.total ?? 0} passed · ${run.errored ?? 0} errored · ${run.status}\n`,
  );

  const belowMin =
    parsed.minScore !== undefined && (run.score === null || run.score < parsed.minScore);

  if (run.status !== 'completed' || (run.errored ?? 0) > 0 || belowMin) process.exitCode = 1;
};
