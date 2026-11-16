import type { Noun, VerbInput } from '../command.js';
import { dojoJSON, segment } from '../dojo.js';
import { ShareError } from '../error.js';
import { done } from '../io.js';
import type { Workspace } from '../workspaces.js';
import { findWorkspace } from '../workspaces.js';
import { dollars } from './appActions.js';

type Plan = Workspace & {
  plan?: string | null;
  subscriptionStatus?: string | null;
  paidApps?: number | null;
  currentPeriodEnd?: string | null;
  aiBalanceUSD?: number | null;
  aiAutoRecharge?: boolean | null;
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

/** `billing status | manage | ai | add-funds`. Paying happens in the browser: `manage` and `add-funds` print the link. */
export const billing: Noun = {
  summary:
    "See a workspace's plan and AI balance, or get the links that manage billing and add AI funds.",
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
    ai: {
      summary: "Show a workspace's AI balance and whether auto-recharge is on.",
      flags: workspaceFlag,
      run: async (input) => {
        const { id, slug } = await workspace(input);
        const read = await dojoJSON<Plan>(input.dojo(), `/api/workspaces/${segment(id)}?depth=0`, {
          what: `Couldn't read the AI balance of ${slug}`,
        });

        const ai = {
          workspace: slug,
          balanceUSD: read.aiBalanceUSD ?? null,
          autoRecharge: read.aiAutoRecharge === true,
        };

        const balance =
          ai.balanceUSD === null
            ? 'AI balance not reported'
            : `${dollars(ai.balanceUSD)} AI balance`;

        done(input.io, ai, [
          `${slug}: ${balance}, auto-recharge ${ai.autoRecharge ? 'on' : 'off'}`,
        ]);
      },
    },
    'add-funds': {
      summary: 'Print the link that adds AI funds to a workspace, for a person to pay at.',
      flags: {
        ...workspaceFlag,
        amount: {
          type: 'string',
          value: 'dollars',
          help: 'Whole dollars to add, 10 to 1000. Default: 20.',
        },
      },
      run: async (input) => {
        const amount = Number(input.values.amount ?? '20');

        if (!Number.isInteger(amount) || amount < 10 || amount > 1000) {
          throw new ShareError(`Give --amount as whole dollars from 10 to 1000, such as 20.`, 2);
        }

        const { id, slug } = await workspace(input);
        const { url } = await dojoJSON<{ url: string }>(input.dojo(), '/api/billing/ai-checkout', {
          method: 'POST',
          body: { workspace: String(id), amount },
          what: `Couldn't start adding AI funds to ${slug}`,
          needs: 'owner access to the workspace',
        });

        if (input.io.isTTY && !input.io.json) input.io.openBrowser(url);

        done(input.io, { workspace: slug, amount, url }, [
          `[frogbot] Add ${dollars(amount)} of AI funds to ${slug}, plus the processing fee:`,
          url,
        ]);
      },
    },
  },
};
