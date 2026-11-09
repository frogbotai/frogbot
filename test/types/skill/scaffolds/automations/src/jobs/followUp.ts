// src/jobs/followUp.ts
import type { WorkflowConfig } from 'frogbot/jobs';

const DAY = 24 * 60 * 60 * 1000;

const steps = [
  { day: 0, subject: 'Welcome aboard' },
  { day: 3, subject: 'Getting started' },
  { day: 7, subject: 'How is it going?' },
];

export const followUp: WorkflowConfig<{ enrollmentId: string }> = {
  slug: 'follow-up',
  inputSchema: [{ name: 'enrollmentId', type: 'text', required: true }],
  retries: 3,
  async handler({ job, inlineTask, waitFor, req }) {
    const { enrollmentId } = job.input;

    for (const [index, step] of steps.entries()) {
      if (step.day > 0) {
        await waitFor(`wait-${index}`, {
          until: new Date(Date.parse(job.createdAt) + step.day * DAY),
        });
      }

      const enrollment = await inlineTask(`check-${index}`, {
        task: async () => {
          const doc = await req.frogbot.findByID({
            collection: 'enrollments',
            id: enrollmentId,
            overrideAccess: true,
            req,
          });

          return { output: { status: String(doc.status), email: String(doc.email) } };
        },
      });

      if (enrollment.status === 'stopped') return;
      if (enrollment.status === 'paused') continue;

      await inlineTask(`send-${index}`, {
        task: async () => {
          await req.frogbot.email.sendEmail({
            to: enrollment.email,
            subject: step.subject,
            text: `${step.subject}. Reply to this email if you need a hand.`,
          });

          return { output: {} };
        },
      });
    }

    await inlineTask('finish', {
      task: async () => {
        await req.frogbot.update({
          collection: 'enrollments',
          id: enrollmentId,
          data: { status: 'finished' },
          overrideAccess: true,
          req,
        });

        return { output: {} };
      },
    });
  },
};
