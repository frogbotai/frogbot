import type { Noun } from '../command.js';
import { dojoJSON } from '../dojo.js';
import { ShareError } from '../error.js';
import { done } from '../io.js';
import { count, findApp, whereEquals } from './resolve.js';

type Share = { id: string | number; email: string; level: string; invited: boolean; you: boolean };

type SharingReply = { url: string; visibility?: string; shares: Share[] };

type InviteReply = { created: string[]; existing: string[]; failed: string[] };

const levels = ['use', 'editor', 'owner'];

const ownerNeeded = 'owner access to the app';

/** `sharing list | invite | leave`: who can use, edit or own an app (DR-070's levels). */
export const sharing: Noun = {
  summary: 'See who an app is shared with, invite people, or leave an app.',
  verbs: {
    list: {
      summary: 'List the people an app is shared with and their level.',
      args: '<app>',
      run: async ({ io, dojo, positionals: [ref = ''] }) => {
        const app = await findApp(dojo(), ref);
        const reply = await dojoJSON<SharingReply>(
          dojo(),
          `/api/projects/${encodeURIComponent(String(app.id))}/sharing`,
          { what: `Couldn't read who ${app.slug} is shared with`, needs: ownerNeeded },
        );

        const shares = reply.shares.map(({ email, level, invited, you }) => ({
          email,
          level,
          invited,
          you,
        }));

        done(
          io,
          shares,
          shares.map(
            ({ email, level, invited, you }) =>
              `${email}  ${level}${invited ? '  (invited)' : ''}${you ? '  (you)' : ''}`,
          ),
        );
      },
    },
    invite: {
      summary: 'Share an app with people by email. Dojo emails each one.',
      args: '<app> <email>...',
      flags: {
        level: {
          type: 'string',
          value: 'use|editor|owner',
          help: 'What they can do. Default use.',
        },
      },
      run: async ({ io, dojo, positionals: [ref = '', ...emails], values }) => {
        const level = typeof values.level === 'string' ? values.level : 'use';

        if (!levels.includes(level)) {
          throw new ShareError(`Choose a level: ${levels.join(', ')}.`, 2);
        }

        const app = await findApp(dojo(), ref);
        const reply = await dojoJSON<InviteReply>(
          dojo(),
          `/api/projects/${encodeURIComponent(String(app.id))}/invite`,
          {
            method: 'POST',
            body: { emails: emails.join(', '), level },
            what: `Couldn't share ${app.slug}`,
            needs: ownerNeeded,
          },
        );

        done(io, reply, [
          `[frogbot] Shared ${app.slug} with ${count(reply.created.length, 'person', 'people')} at ${level}.`,
          ...(reply.existing.length ? [`Already shared: ${reply.existing.join(', ')}`] : []),
          ...(reply.failed.length ? [`Couldn't email: ${reply.failed.join(', ')}`] : []),
        ]);
      },
    },
    leave: {
      summary: 'Remove yourself from an app shared with you.',
      args: '<app>',
      confirm: ({ positionals: [ref] }) => `Leave ${ref}? You'll need a new invite to get back.`,
      run: async ({ io, dojo, positionals: [ref = ''] }) => {
        const { docs } = await dojoJSON<{ docs: { id: string | number; slug: string }[] }>(
          dojo(),
          `/api/projects?depth=0&limit=1&${whereEquals('slug', ref)}`,
          { what: `Couldn't find the app "${ref}"` },
        );

        const [app] = docs;

        if (!app) throw new ShareError(`No app "${ref}" is shared with you.`);

        await dojoJSON(dojo(), `/api/projects/${encodeURIComponent(String(app.id))}/sharing/me`, {
          method: 'DELETE',
          what: `Couldn't leave ${app.slug}`,
        });

        done(io, { left: { id: app.id, slug: app.slug } }, [`[frogbot] Left ${app.slug}.`]);
      },
    },
  },
};
