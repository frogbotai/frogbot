import { aiPolicyPlugin } from '@frogbotai/plugin-ai-policy';
import type { CollectionConfig, Tool, Where } from 'frogbot';
import { general } from 'frogbot/agents';
import { question, todoTools } from 'frogbot/tools';
import { z } from 'zod';

import { buildTestConfig, openAccess } from '../__helpers/shared/buildTestConfig.js';
import {
  agentSlug,
  approvedCalls,
  approverAgentSlug,
  chatsSlug,
  compactorAgentSlug,
  lookupCalls,
  memberName,
  modelPort,
  notesSlug,
  questionAgentSlug,
  readerAccessCalls,
  readerAgentSlug,
  readerHandlerRuns,
  readerHandlerSlug,
  readerScheduleSlug,
  refunderName,
  unavailableTopic,
  usersSlug,
} from './shared.js';

const Users: CollectionConfig = {
  slug: usersSlug,
  auth: true,
  access: openAccess,
  fields: [{ name: 'name', type: 'text' }],
};

const lookupInput = z.object({ topic: z.string() });

const lookup: Tool<typeof lookupInput, string> = {
  slug: 'lookup',
  description: 'Look up a topic.',
  inputSchema: lookupInput,
  execute: ({ topic }) => {
    lookupCalls.push(topic);

    if (topic === unavailableTopic) throw new Error(`No results for ${topic}.`);

    return `Found ${topic}.`;
  },
};

const ticketInput = z.object({ ticket: z.string() });

const closeTicket: Tool<typeof ticketInput, string> = {
  slug: 'close_ticket',
  description: 'Close a ticket.',
  inputSchema: ticketInput,
  approval: 'ask',
  execute: ({ ticket }) => {
    approvedCalls.push({ tool: 'close_ticket', input: { ticket } });

    return `Closed ${ticket}.`;
  },
};

const deleteTicket: Tool<typeof ticketInput, string> = {
  slug: 'delete_ticket',
  description: 'Delete a ticket.',
  inputSchema: ticketInput,
  approval: () => ({ mode: 'required', reason: 'Deleting cannot be undone.' }),
  execute: ({ ticket }) => {
    approvedCalls.push({ tool: 'delete_ticket', input: { ticket } });

    return `Deleted ${ticket}.`;
  },
};

const refundTicket: Tool<typeof ticketInput, string> = {
  slug: 'refund_ticket',
  description: 'Refund a ticket.',
  inputSchema: ticketInput,
  approval: 'ask',
  access: ({ req }) => (req.user as { name?: string } | null)?.name === refunderName,
  execute: ({ ticket }) => {
    approvedCalls.push({ tool: 'refund_ticket', input: { ticket } });

    return `Refunded ${ticket}.`;
  },
};

const Chats: CollectionConfig = {
  slug: chatsSlug,
  chat: true,
  access: {
    read: ({ req }) => {
      if (!req.user) return false;

      const ownOrShared: Where = {
        or: [{ user: { equals: req.user.id } }, { sharedWith: { contains: req.user.id } }],
      };

      return ownOrShared;
    },
  },
  fields: [{ name: 'sharedWith', type: 'relationship', relationTo: usersSlug, hasMany: true }],
};

const Notes: CollectionConfig = {
  slug: notesSlug,
  access: { read: ({ req }) => (req.user as { name?: string } | null)?.name === memberName },
  fields: [{ name: 'text', type: 'text' }],
};

const notesInput = z.object({});

const readNotes: Tool<typeof notesInput, string> = {
  slug: 'read_notes',
  description: 'Read the members-only notes.',
  inputSchema: notesInput,
  execute: async (_input, ctx) => {
    const { docs } = await ctx.frogbot.find({
      collection: notesSlug,
      depth: 0,
      req: ctx.req,
      overrideAccess: ctx.overrideAccess,
    });

    return docs.map((doc) => String((doc as { text?: string }).text)).join(', ');
  },
  sources: async (_result, ctx) => {
    const { docs } = await ctx.frogbot.find({
      collection: notesSlug,
      depth: 0,
      req: ctx.req,
      overrideAccess: ctx.overrideAccess,
    });

    return docs.map(({ id }) => ({ collection: notesSlug, id, title: 'Members notes' }));
  },
};

const readNotesApproved: Tool<typeof notesInput, string> = {
  ...readNotes,
  slug: 'read_notes_approved',
  description: 'Read the members-only notes once approved.',
  approval: 'ask',
};

const generalAgent = general({ tools: [...todoTools] });

export const generalAgentSlug = generalAgent.slug;
export const wildcardAgentSlug = 'wildcard';

export default await buildTestConfig({
  collections: [Users, Chats, Notes],
  ai: {
    defaultModel: 'test/gpt-4.1-mini',
    compaction: { keep: 200 },
    providers: {
      test: {
        type: 'openai-compatible',
        baseUrl: `http://127.0.0.1:${modelPort}/v1`,
        apiKey: 'test-key',
        models: [
          { id: 'gpt-4.1-mini', mode: 'chat' },
          { id: 'small-window', mode: 'chat', limit: { context: 4_000 } },
          {
            id: 'thinker',
            mode: 'chat',
            reasoningOptions: [{ type: 'effort', values: ['low', 'high'] }],
          },
          { id: 'writer', mode: 'chat', reasoningOptions: [{ type: 'effort', values: ['max'] }] },
          { id: 'reasoner', mode: 'chat', reasoning: true },
          { id: 'text-only', mode: 'chat', modalities: { input: ['text'], output: ['text'] } },
          {
            id: 'media',
            mode: 'chat',
            modalities: { input: ['text', 'image', 'audio', 'video', 'pdf'], output: ['text'] },
          },
        ],
      },
    },
  },
  agents: [
    {
      slug: agentSlug,
      model: 'test/gpt-4.1-mini',
      instructions: 'Help the user.',
      access: () => true,
      tools: [...todoTools],
    },
    {
      slug: questionAgentSlug,
      model: {
        default: 'test/gpt-4.1-mini',
        options: ['test/thinker', 'test/writer', 'test/reasoner', 'test/text-only', 'test/media'],
      },
      instructions: 'Ask before acting.',
      access: () => true,
      tools: [question, lookup],
    },
    {
      slug: wildcardAgentSlug,
      model: { default: 'test/gpt-4.1-mini', options: '*' },
      instructions: 'Help the user.',
      access: () => true,
      tools: [...todoTools],
    },
    {
      slug: approverAgentSlug,
      model: 'test/gpt-4.1-mini',
      instructions: 'Ask before changing tickets.',
      access: () => true,
      tools: [closeTicket, deleteTicket, refundTicket, question],
    },
    {
      slug: readerAgentSlug,
      model: 'test/gpt-4.1-mini',
      instructions: 'Summarise the notes.',
      access: ({ req }) => {
        readerAccessCalls.push(req.user?.id ?? null);

        return !!req.user;
      },
      tools: [readNotes, readNotesApproved],
      triggers: [
        {
          type: 'schedule',
          slug: readerScheduleSlug,
          schedule: { every: '1d' },
          prompt: 'Summarise the notes.',
        },
        {
          type: 'schedule',
          slug: readerHandlerSlug,
          schedule: { every: '1d' },
          handler: async ({ agent, req }) => {
            for (const opts of [{}, { overrideAccess: true }]) {
              try {
                await agent.generate({ prompt: 'Summarise the notes.', req, ...opts });
                readerHandlerRuns.push('ok');
              } catch (error) {
                readerHandlerRuns.push((error as { status?: number }).status ?? 'error');
              }
            }
          },
        },
      ],
    },
    {
      slug: compactorAgentSlug,
      model: 'test/small-window',
      instructions: 'Help the user.',
      access: () => true,
      tools: [lookup, question, closeTicket],
    },
    generalAgent,
  ],
  plugins: [aiPolicyPlugin()],
});
