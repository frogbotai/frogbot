import type { DojoClient } from './dojo.js';
import { dojoMessage } from './dojo.js';
import { ShareError } from './error.js';
import type { ShareIO } from './io.js';
import { say } from './io.js';

const pollMs = 5000;
const maxPolls = 360;

const paying = new Set(['active', 'trialing', 'past_due']);

type Paywall = { why: string; url: string; workspace: string; apps: number; owner: boolean };

const upgradeLink = /\S*\/billing\/upgrade\?[^\s,;]+/;
const askOwner = 'Ask a workspace owner';
const nextStep =
  /\s*(?:Pay for it at|Ask a workspace owner to open|A workspace owner can pay for it at)\s*$/;

function readPaywall(message: string, dojoUrl: string): Paywall | undefined {
  const match = upgradeLink.exec(message);

  if (!match) return undefined;

  const url = new URL(match[0].replace(/\.+$/, ''), dojoUrl);
  const workspace = url.searchParams.get('workspace');

  if (!workspace) return undefined;

  return {
    why: message.slice(0, match.index).replace(nextStep, ''),
    url: url.href,
    workspace,
    apps: Number(url.searchParams.get('apps')) || 1,
    owner: !message.includes(askOwner),
  };
}

async function paid(dojo: DojoClient, paywall: Paywall): Promise<boolean> {
  const response = await dojo.request(
    `/api/workspaces/${encodeURIComponent(paywall.workspace)}?depth=0`,
  );

  if (!response.ok) {
    throw new ShareError(`Couldn't check the workspace's plan: ${await dojoMessage(response)}`);
  }

  const workspace = (await response.json()) as {
    subscriptionStatus?: string | null;
    paidApps?: number | null;
  };

  return (
    paying.has(workspace.subscriptionStatus ?? '') && (workspace.paidApps ?? 0) >= paywall.apps
  );
}

function showPaywall(io: ShareIO, paywall: Paywall): void {
  say(io, `[frogbot] ${paywall.why}`);

  say(
    io,
    paywall.owner
      ? '[frogbot] Pay for it here; the share carries on once Dojo has the payment:'
      : '[frogbot] Ask a workspace owner to pay for it here; the share carries on once Dojo has the payment:',
  );

  say(io, paywall.url);

  if (io.isTTY && paywall.owner) io.openBrowser(paywall.url);
}

/**
 * Sends a request that may need a paid app on Dojo. On a 402 with Dojo's upgrade link, shows the link, waits until
 * the workspace's plan pays for the app, then sends it again; any other reply is returned as it came.
 */
export async function whenPaid(
  dojo: DojoClient,
  io: ShareIO,
  send: () => Promise<Response>,
): Promise<Response> {
  let polls = 0;
  let shown: string | undefined;

  for (;;) {
    const response = await send();

    if (response.status !== 402) return response;

    const paywall = readPaywall(await dojoMessage(response.clone()), dojo.url);

    if (!paywall) return response;

    if (paywall.url !== shown) {
      showPaywall(io, paywall);
      shown = paywall.url;
    }

    do {
      polls += 1;

      if (polls > maxPolls) {
        throw new ShareError(
          `Dojo still has no payment for this app after ${(maxPolls * pollMs) / 60_000} minutes. Once it's paid, share again.`,
        );
      }

      await io.wait(pollMs);
    } while (!(await paid(dojo, paywall)));

    say(io, '[frogbot] Paid. Carrying on.');
  }
}
