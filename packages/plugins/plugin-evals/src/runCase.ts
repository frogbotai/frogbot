import type { AgentInstance, AgentModelId, DocID, FrogBotRequest } from 'frogbot';

import { RESULTS } from './collections.js';
import type { EvalToolCall, Scorer, ScorerOutcome } from './scorers.js';
import { runScorer } from './scorers.js';

export type EvalCase = {
  id: DocID;
  input: string;
  expected?: string | null;
  expectedTools?: string[] | null;
  metadata?: unknown;
};

export type CaseOutcome = {
  result: DocID;
  errored: boolean;
  scores: Record<string, number | null>;
};

type StepContent = { type: string; toolCallId?: string; toolName?: string } & Record<
  string,
  unknown
>;

export function toToolCalls(steps: readonly { content: readonly unknown[] }[]): EvalToolCall[] {
  const calls = new Map<string, EvalToolCall>();

  for (const part of steps.flatMap(({ content }) => content as StepContent[])) {
    const id = part.toolCallId;

    if (id === undefined) continue;

    if (part.type === 'tool-call') {
      calls.set(id, { toolName: String(part.toolName), input: part.input });
    } else if (part.type === 'tool-result') {
      const call = calls.get(id);

      if (call) call.output = part.output;
    } else if (part.type === 'tool-error') {
      const call = calls.get(id);

      if (call) call.error = part.error instanceof Error ? part.error.message : part.error;
    }
  }

  return [...calls.values()];
}

async function runAgent({
  agent,
  input,
  req,
  overrideAccess,
  model,
}: {
  agent: AgentInstance;
  input: string;
  req: FrogBotRequest;
  overrideAccess: boolean;
  model?: AgentModelId;
}) {
  const result = await agent.stream({
    prompt: input,
    req,
    overrideAccess,
    ...(model === undefined ? {} : { model }),
  });

  let failure: unknown;

  for await (const part of result.fullStream) {
    if (part.type === 'error') failure ??= part.error;
  }

  if (failure !== undefined) {
    throw failure instanceof Error ? failure : new Error(String(failure));
  }

  const [text, steps, usage] = await Promise.all([result.text, result.steps, result.totalUsage]);

  return { output: text, toolCalls: toToolCalls(steps), usage };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runCase({
  run,
  evalCase,
  agent,
  scorers,
  req,
  overrideAccess,
  model,
}: {
  run: DocID;
  evalCase: EvalCase;
  agent: AgentInstance;
  scorers: readonly (readonly [string, Scorer])[];
  req: FrogBotRequest;
  overrideAccess: boolean;
  model?: AgentModelId;
}): Promise<CaseOutcome> {
  const started = Date.now();
  const input = evalCase.input;
  const expected = evalCase.expected ?? undefined;
  const expectedTools = evalCase.expectedTools?.length ? evalCase.expectedTools : undefined;

  let ran: Awaited<ReturnType<typeof runAgent>> | undefined;
  let error: string | undefined;

  try {
    ran = await runAgent({ agent, input, req, overrideAccess, model });
  } catch (cause) {
    error = message(cause);
  }

  const durationMs = Date.now() - started;
  const scores: (ScorerOutcome & { scorer: string })[] = [];

  if (ran) {
    for (const [name, scorer] of scorers) {
      const outcome = await runScorer(scorer, {
        input,
        expected,
        expectedTools,
        output: ran.output,
        toolCalls: ran.toolCalls,
        metadata: evalCase.metadata ?? undefined,
        req,
        overrideAccess,
      });

      scores.push({ scorer: name, ...outcome });
    }
  }

  const data = {
    run,
    case: evalCase.id,
    caseSnapshot: { input, expected, expectedTools, metadata: evalCase.metadata ?? null },
    output: ran?.output ?? null,
    toolCalls: ran?.toolCalls ?? null,
    usage: ran?.usage ?? null,
    durationMs,
    error: error ?? null,
    scores,
  };

  const result = await saveResult({ req, data });

  return {
    result,
    errored: error !== undefined,
    scores: Object.fromEntries(scores.map(({ scorer, score }) => [scorer, score])),
  };
}

async function saveResult({
  req,
  data,
}: {
  req: FrogBotRequest;
  data: { run: DocID; case: DocID } & Record<string, unknown>;
}): Promise<DocID> {
  const common = { collection: RESULTS, depth: 0, overrideAccess: true, req } as const;

  const existing = await req.frogbot.find({
    ...common,
    where: { and: [{ run: { equals: data.run } }, { case: { equals: data.case } }] },
    limit: 1,
    pagination: false,
  });

  const id = (existing.docs[0] as { id: DocID } | undefined)?.id;

  const doc =
    id === undefined
      ? await req.frogbot.create({ ...common, data })
      : await req.frogbot.update({ ...common, id, data });

  return (doc as { id: DocID }).id;
}
