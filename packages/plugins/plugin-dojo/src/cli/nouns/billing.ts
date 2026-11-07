import type { Noun, VerbInput } from '../command.js';
import { dojoJSON, segment } from '../dojo.js';
import { done } from '../io.js';
import type { Workspace } from '../workspaces.js';
import { findWorkspace } from '../workspaces.js';

type Plan = Workspace & {
  plan?: string | null;
  subscriptionStatus?: string | null;
  paidApps?: number | null;
  currentPeriodEnd?: string | null;
};

const workspaceFlag = {
  workspace: {
    type: 'string' as const,
    value: 'slug',
    help: 'The workspace. Needed when you are in more than one.',
  },
};

async function workspace({ io, dojo, values }: VerbInput): Promise<Workspace> {
  return findWorkspace({
    dojo: dojo(),
    io,
    slug: typeof values.workspace === 'string' ? values.workspace : undefined,
  });
}

/** `billing status | manage`. Paying happens in the browser: `manage` prints the link. */
export const billing: Noun = {
  summary: "See a workspace's plan, or get the link to manage its billing.",
  verbs: {
    status: {
      summary: "Show a workspace's plan, status and paid apps.",
      flags: workspaceFlag,
      run: async (input) => {
        const { id, slug } = await workspace(input);
        const plan = await dojoJSON<Plan>(input.dojo(), `/api/workspaces/${segment(id)}?depth=0`, {
          what: `Couldn't read the plan of ${slug}`,
        });

        const status = {
          workspace: slug,
          plan: plan.plan && plan.plan !== 'none' ? plan.plan : null,
          status: plan.subscriptionStatus ?? null,
          paidApps: plan.paidApps ?? 0,
          renews: plan.currentPeriodEnd ?? null,
        };

        done(input.io, status, [
          `${slug}: ${status.plan ?? 'no plan'}${status.status ? ` (${status.status})` : ''}, ${status.paidApps} paid ${status.paidApps === 1 ? 'app' : 'apps'}`,
          ...(status.plan
            ? []
            : [`Choose a plan at ${input.dojo().url}/billing/upgrade?workspace=${id}`]),
        ]);
      },
    },
    manage: {
      summary: 'Print the link to change the card, see invoices or cancel.',
      flags: workspaceFlag,
      run: async (input) => {
        const { id, slug } = await workspace(input);
        const { url } = await dojoJSON<{ url: string }>(input.dojo(), '/api/billing/portal', {
          method: 'POST',
          body: { workspace: String(id) },
          what: `Couldn't open the billing of ${slug}`,
          needs: 'owner access to the workspace',
        });

        if (input.io.isTTY && !input.io.json) input.io.openBrowser(url);

        done(input.io, { workspace: slug, url }, [`[frogbot] Manage billing for ${slug}:`, url]);
      },
    },
  },
};
