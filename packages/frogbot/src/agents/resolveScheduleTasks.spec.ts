import type { JobsConfig, TaskConfig } from "payload";
import { describe, expect, it, vi } from "vitest";

import { registerFrogbotInstance } from "../instanceRegistry.js";
import type { AgentConfig, AgentInstance } from "../types/agent.js";
import {
  AGENT_SCHEDULE_TASK_SLUG,
  everyToCron,
  resolveScheduleTasks,
} from "./resolveScheduleTasks.js";

const baseAgent = {
  slug: "reporter",
  model: "openai/test",
  instructions: "Report",
} as AgentConfig;

function task(jobs: JobsConfig | undefined): TaskConfig {
  return jobs!.tasks!.find(({ slug }) => slug === AGENT_SCHEDULE_TASK_SLUG)!;
}

describe("agent schedule tasks", () => {
  it.each([
    ["30s", "*/30 * * * * *"],
    ["60s", "* * * * *"],
    ["5m", "*/5 * * * *"],
    ["60m", "0 * * * *"],
    ["2h", "0 */2 * * *"],
    ["24h", "0 0 * * *"],
    ["1d", "0 0 * * *"],
  ])("converts %s to cron", (every, cron) => {
    expect(everyToCron(every)).toBe(cron);
  });

  it.each(["0m", "45m", "90s", "2d", "soon"])(
    "rejects unsupported duration %s",
    (every) => expect(() => everyToCron(every)).toThrow("raw cron expression"),
  );

  it("preserves user jobs and creates stable isolated schedules", async () => {
    const userTask = { slug: "user-task", handler: vi.fn() } as TaskConfig;
    const userAutoRun = { queue: "user", cron: "0 * * * *" };
    const agents = [
      {
        ...baseAgent,
        triggers: [
          { type: "schedule", slug: "hourly", schedule: { every: "1h" }, prompt: "Run" },
          { type: "schedule", slug: "daily", schedule: { cron: "0 0 * * *" }, prompt: "Run" },
        ],
      },
    ] satisfies AgentConfig[];

    const first = resolveScheduleTasks({
      agents,
      jobs: { tasks: [userTask], workflows: [], autoRun: [userAutoRun] },
    });
    const second = resolveScheduleTasks({ agents });

    expect(first?.tasks?.[0]).toBe(userTask);
    expect(first?.workflows).toEqual([]);
    expect(first?.autoRun).toEqual([userAutoRun, { allQueues: true, cron: "* * * * *" }]);
    expect(task(first).schedule?.map(({ queue }) => queue)).toEqual([
      "frogbot-schedule:reporter:hourly",
      "frogbot-schedule:reporter:daily",
    ]);
    expect(task(second).schedule?.map(({ queue }) => queue)).toEqual(
      task(first).schedule?.map(({ queue }) => queue),
    );

    const beforeSchedule = task(first).schedule?.[0]?.hooks?.beforeSchedule;
    const defaultBeforeSchedule = vi.fn().mockResolvedValue({ shouldSchedule: true, waitUntil: new Date(0) });
    await expect(beforeSchedule!({ defaultBeforeSchedule, jobStats: {} as never, queueable: {} as never, req: {} as never })).resolves.toMatchObject({
      input: { agentSlug: "reporter", triggerSlug: "hourly" },
      shouldSchedule: true,
    });
  });

  it("composes a user autoRun function", async () => {
    const payload = {} as never;
    const jobs = resolveScheduleTasks({
      agents: [{
        ...baseAgent,
        triggers: [{ type: "schedule", slug: "run", schedule: { every: "1h" }, prompt: "Run" }],
      }],
      jobs: { autoRun: async (value) => [{ queue: value === payload ? "user" : "wrong" }] },
    });

    const autoRun = jobs?.autoRun;
    if (typeof autoRun !== "function") throw new Error("Expected autoRun function");
    expect(await autoRun(payload)).toEqual([
      { queue: "user" },
      { allQueues: true, cron: "* * * * *" },
    ]);
  });

  it("executes prompt and handler triggers with schedule context", async () => {
    const payload = {};
    const generate = vi.fn();
    const handler = vi.fn();
    const createRequest = vi.fn(async ({ context }) => ({ context, user: null }));
    const agent = {
      slug: "reporter",
      config: {
        ...baseAgent,
        triggers: [
          { type: "schedule", slug: "prompt", schedule: { every: "1h" }, prompt: "Run report" },
          { type: "schedule", slug: "handler", schedule: { every: "1h" }, handler },
        ],
      },
      generate,
    } as unknown as AgentInstance;
    const frogbot = { agents: { reporter: agent }, createRequest };
    registerFrogbotInstance(payload, frogbot as never);
    const config = resolveScheduleTasks({ agents: [agent.config] });
    const run = task(config).handler;
    if (typeof run !== "function") throw new Error("Expected task handler");
    const job = { id: 42, waitUntil: "2026-07-29T12:00:00.000Z", createdAt: "2026-07-29T11:00:00.000Z" };
    const req = { payload };

    await run({ input: { agentSlug: "reporter", triggerSlug: "prompt" }, job, req, inlineTask: vi.fn(), tasks: {} });
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({ prompt: "Run report", overrideAccess: true }));
    expect(createRequest).toHaveBeenCalledWith({ context: { source: "schedule", agentSlug: "reporter", triggerSlug: "prompt", jobId: 42 } });

    await run({ input: { agentSlug: "reporter", triggerSlug: "handler" }, job, req, inlineTask: vi.fn(), tasks: {} });
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({
      frogbot,
      agent,
      req: expect.objectContaining({ user: null }),
      job: { id: 42, scheduledFor: new Date(job.waitUntil) },
    }));
  });

  it("no-ops when an agent or trigger was removed", async () => {
    const payload = {};
    const generate = vi.fn();
    const staleAgent = { ...baseAgent, triggers: [] };
    registerFrogbotInstance(payload, {
      agents: { reporter: { config: staleAgent, generate } },
    } as never);
    const config = resolveScheduleTasks({
      agents: [{ ...baseAgent, triggers: [{ type: "schedule", slug: "run", schedule: { every: "1h" }, prompt: "Run" }] }],
    });
    const run = task(config).handler;
    if (typeof run !== "function") throw new Error("Expected task handler");
    const args = { job: {}, req: { payload }, inlineTask: vi.fn(), tasks: {} };
    await expect(run({ ...args, input: { agentSlug: "missing", triggerSlug: "run" } })).resolves.toEqual({ output: {} });
    await expect(run({ ...args, input: { agentSlug: "reporter", triggerSlug: "missing" } })).resolves.toEqual({ output: {} });
    expect(generate).not.toHaveBeenCalled();
  });
});
