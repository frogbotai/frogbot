import type { Noun } from '../command.js';
import type { DojoClient } from '../dojo.js';
import { dojoJSON, segment } from '../dojo.js';
import { ShareError } from '../error.js';
import { done } from '../io.js';
import { count, findApp } from './resolve.js';

type AppKey = { name: string; last4: string; source: string; setBy: string | null; setAt: string };

type KeysReply = { keys: AppKey[] };

type ChangeReply = { changed: string[]; retrying: boolean };

const ownerNeeded = 'owner access to the app';

const keyName = /^[A-Za-z_][A-Za-z0-9_]*$/;

function checkName(name: string): string {
  if (!keyName.test(name)) {
    throw new ShareError(
      `"${name}" isn't a key name: use letters, digits and _, not starting with a digit.`,
      2,
    );
  }

  return name;
}

function parseAssignments(args: string[]): Record<string, string> {
  return Object.fromEntries(
    args.map((arg) => {
      const at = arg.indexOf('=');

      if (at < 1 || at === arg.length - 1) {
        throw new ShareError(`Write each key as KEY=value; "${arg}" isn't.`, 2);
      }

      return [checkName(arg.slice(0, at)), arg.slice(at + 1)];
    }),
  );
}

async function change(
  dojo: DojoClient,
  ref: string,
  values: Record<string, string | null>,
): Promise<ChangeReply & { app: string }> {
  const app = await findApp(dojo, ref);
  const reply = await dojoJSON<ChangeReply>(dojo, `/api/apps/${segment(app.id)}/keys`, {
    method: 'PUT',
    body: { values },
    what: `Couldn't change the keys of ${app.slug}`,
    needs: ownerNeeded,
  });

  return { app: app.slug, ...reply };
}

function restartLine({ changed, retrying }: ChangeReply): string {
  if (changed.length === 0) return 'Nothing changed.';

  return retrying ? 'Its last version starts again with them.' : 'It restarts once.';
}

/** `env list | set | unset`: an app's environment keys on Dojo, never shown in full. */
export const env: Noun = {
  summary: "List, set and remove an app's environment keys.",
  verbs: {
    list: {
      summary: "List an app's keys, masked.",
      args: '<app>',
      run: async ({ io, dojo, positionals: [ref = ''] }) => {
        const app = await findApp(dojo(), ref);
        const { keys } = await dojoJSON<KeysReply>(dojo(), `/api/apps/${segment(app.id)}/keys`, {
          what: `Couldn't read the keys of ${app.slug}`,
          needs: ownerNeeded,
        });

        const listed = keys.map(({ name, last4, source, setBy, setAt }) => ({
          name,
          last4,
          source,
          setBy,
          setAt,
        }));

        done(
          io,
          listed,
          listed.length
            ? listed.map(({ name, last4 }) => `${name} ••••${last4}`)
            : [`[frogbot] ${app.slug} has no keys.`],
        );
      },
    },
    set: {
      summary: 'Set keys. The app restarts once with them.',
      args: '<app> <KEY=value>...',
      run: async ({ io, dojo, positionals: [ref = '', ...assignments] }) => {
        const result = await change(dojo(), ref, parseAssignments(assignments));

        done(io, result, [
          `[frogbot] Set ${count(result.changed.length, 'key')} on ${result.app}. ${restartLine(result)}`,
        ]);
      },
    },
    unset: {
      summary: 'Remove keys. The app restarts once without them.',
      args: '<app> <KEY>...',
      confirm: ({ positionals: [ref, ...names] }) => `Remove ${names.join(', ')} from ${ref}?`,
      run: async ({ io, dojo, positionals: [ref = '', ...names] }) => {
        const values = Object.fromEntries(names.map((name) => [checkName(name), null]));
        const result = await change(dojo(), ref, values);

        done(io, result, [
          `[frogbot] Removed ${count(result.changed.length, 'key')} from ${result.app}. ${restartLine(result)}`,
        ]);
      },
    },
  },
};
