import type { Noun } from '../command.js';
import type { DojoClient } from '../dojo.js';
import { dojoList } from '../dojo.js';
import { ShareError } from '../error.js';
import { done } from '../io.js';

/** A template as Dojo's Templates page reads it: FrogBot's own, and ones saved in your workspaces. */
export type Template = {
  id: string | number;
  name: string;
  summary: string;
  tags?: string[] | null;
  workspace?: string | number | { id: string | number } | null;
};

async function listTemplates(dojo: DojoClient): Promise<Template[]> {
  return dojoList<Template>(dojo, '/api/templates?depth=0&limit=100&sort=name', {
    what: "Couldn't list the templates",
  });
}

/** The template `ref` names by id, or by its name in any case. Refuses a name two templates share. */
export async function findTemplate(dojo: DojoClient, ref: string): Promise<Template> {
  const templates = await listTemplates(dojo);
  const byId = templates.find(({ id }) => String(id) === ref);

  if (byId) return byId;

  const named = templates.filter(({ name }) => name.toLowerCase() === ref.toLowerCase());
  const [only] = named;

  if (named.length > 1) {
    throw new ShareError(
      `${named.length} templates are named "${ref}". Name one by its id: ${named.map(({ id }) => id).join(', ')}.`,
    );
  }

  if (!only) throw new ShareError(`No template "${ref}". templates list shows them.`);

  return only;
}

/** `templates list`. `apps create --template` makes an app from one. */
export const templates: Noun = {
  summary: 'List the templates a new app can start from.',
  verbs: {
    list: {
      summary: "List FrogBot's templates and the ones saved in your workspaces.",
      run: async ({ io, dojo }) => {
        const listed = (await listTemplates(dojo())).map(
          ({ id, name, summary, tags, workspace }) => ({
            id,
            name,
            summary,
            tags: tags ?? [],
            workspace:
              workspace && typeof workspace === 'object' ? workspace.id : (workspace ?? null),
          }),
        );

        done(
          io,
          listed,
          listed.length
            ? listed.map(({ id, name, summary }) => `${id}  ${name}  ${summary}`)
            : ['[frogbot] No templates yet.'],
        );
      },
    },
  },
};
