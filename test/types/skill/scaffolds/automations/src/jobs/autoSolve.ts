// src/jobs/autoSolve.ts
import { createSlack } from '@frogbotai/piece-slack';
import type { WorkflowConfig } from 'frogbot/jobs';

const slack = createSlack({ auth: { botToken: process.env.SLACK_BOT_TOKEN! } });

const WAIT = 48 * 60 * 60 * 1000;

export const autoSolve: WorkflowConfig<{ ticketId: string; pendingSince: string }> = {
  slug: 'auto-solve',
  inputSchema: [
    { name: 'ticketId', type: 'text', required: true },
    { name: 'pendingSince', type: 'text', required: true },
  ],
  retries: 3,
  async handler({ job, inlineTask, waitFor, req }) {
    const { ticketId, pendingSince } = job.input;

    await waitFor('pending-48h', { until: new Date(Date.parse(pendingSince) + WAIT) });

    const ticket = await inlineTask('check', {
      task: async () => {
        const doc = await req.frogbot.findByID({
          collection: 'tickets',
          id: ticketId,
          overrideAccess: true,
          req,
        });

        return {
          output: {
            stillPending: doc.status === 'pending' && doc.pendingSince === pendingSince,
            customerEmail: String(doc.customerEmail),
            subject: String(doc.subject),
          },
        };
      },
    });

    if (!ticket.stillPending) return;

    await inlineTask('solve', {
      task: async () => {
        await req.frogbot.update({
          collection: 'tickets',
          id: ticketId,
          data: { status: 'solved' },
          context: { automation: true },
          overrideAccess: true,
          req,
        });

        return { output: {} };
      },
    });

    await inlineTask('email-customer', {
      task: async () => {
        await req.frogbot.email.sendEmail({
          to: ticket.customerEmail,
          subject: `Solved: ${ticket.subject}`,
          text: 'We marked your ticket solved after 48 hours without a reply. Reply to reopen it.',
        });

        return { output: {} };
      },
    });

    await inlineTask('post-to-slack', {
      task: async () => {
        await slack.sendChannelMessage({
          input: { channel: '#support', text: `Auto-solved ticket ${ticketId}: ${ticket.subject}` },
          overrideAccess: true,
          req,
        });

        return { output: {} };
      },
    });
  },
};
