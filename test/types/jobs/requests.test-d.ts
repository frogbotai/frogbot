import type { Endpoint, FrogBot } from 'frogbot';

export const jobsEndpoint: Endpoint = {
  path: '/jobs-type-fixture',
  method: 'post',
  handler: async (req) => {
    const job = await req.frogbot.jobs.queue({
      task: 'send-notification',
      input: { recipient: 'owner@example.com' },
      jobId: 'endpoint-notification',
      req,
    });

    await req.frogbot.jobs.run({ req });
    await req.frogbot.jobs.runByID({ id: job.id, req });
    await req.frogbot.jobs.handleSchedules({ req });
    await req.frogbot.jobs.cancel({ where: { id: { equals: job.id } }, req });
    await req.frogbot.jobs.cancelByID({ id: job.id, req });

    return Response.json({ id: job.id });
  },
};

export async function jobsWithCreatedRequest(frogbot: FrogBot) {
  const req = await frogbot.createRequest();
  const job = await frogbot.jobs.queue({
    workflow: 'onboard-account',
    input: { accountID: 42 },
    jobId: 'created-request-onboarding',
    req,
  });

  await frogbot.jobs.run({ req });
  await frogbot.jobs.runByID({ id: job.id, req });
  await frogbot.jobs.handleSchedules({ req });
  await frogbot.jobs.cancel({ where: { id: { equals: job.id } }, req });
  await frogbot.jobs.cancelByID({ id: job.id, req });

  await frogbot.jobs.run();
  await frogbot.jobs.run(undefined);
  await frogbot.jobs.handleSchedules();
  await frogbot.jobs.handleSchedules(undefined);
}
