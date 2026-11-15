import type { DojoClient } from './dojo.js';
import { segment } from './dojo.js';
import { dojoError, dojoStop, needsPayment, ShareError } from './error.js';
import type { DojoIO } from './io.js';
import { canWait, say } from './io.js';

const pollMs = 5000;
const maxPolls = 360;

const paying = new Set(['active', 'trialing', 'past_due']);

type Paywall = { why: string; url: string; workspace: string; apps: number; owner: boolean };

const upgradeLink = /\S*\/billing\/upgrade\?[^\s,;]+/;
const someoneElse = /workspace's Owner|workspace owner/i;
const nextStep =
  /\s*(?:Pay for it at|Ask (?:the workspace's|a workspace) Owner to open|(?:The workspace's|A workspace) Owner can pay for it at)\s*$/i;

function readPaywall(message: string, dojoUrl: string, link?: string): Paywall | undefined {
  const match = upgradeLink.exec(message);
  const found = match?.[0].replace(/\.+$/, '') ?? link;

  if (!found) return undefined;

  const url = new URL(found, dojoUrl);
  const workspace = url.searchParams.get('workspace');

  if (!workspace || !url.pathname.endsWith('/billing/upgrade')) return undefined;

  return {
    why: (match ? message.slice(0, match.index) : message).replace(nextStep, ''),
    url: url.href,
    workspace,
    apps: Number(url.searchParams.get('apps')) || 1,
    owner: !someoneElse.test(message),
  };
}

async function paid(dojo: DojoClient, paywall: Paywall): Promise<boolean> {
  const response = await dojo.request(`/api/workspaces/${segment(paywall.workspace)}?depth=0`);

  if (!response.ok) {
    throw await dojoStop(response, "Couldn't check the workspace's plan");
  }

  const workspace = (await response.json()) as {
    subscriptionStatus?: string | null;
    paidApps?: number | null;
  };

  return (
    paying.has(workspace.subscriptionStatus ?? '') && (workspace.paidApps ?? 0) >= paywall.apps
  );
}

function showPaywall(io: DojoIO, paywall: Paywall): void {
  say(io, `[frogbot] ${paywall.why}`);

  say(
    io,
    paywall.owner
      ? '[frogbot] Pay for it here; this carries on once Dojo has the payment:'
      : '[frogbot] Ask a workspace owner to pay for it here; this carries on once Dojo has the payment:',
  );

  say(io, paywall.url);

  if (io.isTTY && paywall.owner) io.openBrowser(paywall.url);
}

function paymentNeeded(paywall: Paywall, then: string): ShareError {
  const who = paywall.owner ? 'Pay for it at' : 'Ask a workspace owner to pay for it at';

  return new ShareError(
    `${paywall.why} ${who} ${paywall.url}, ${then}. Add --wait to wait for the payment here.`,
    needsPayment,
    { needs: 'payment', link: paywall.url },
  );
}

/**
 * Sends a request that may need a paid app on Dojo. On a 402 with Dojo's upgrade link, shows the link, waits until
 * the workspace's plan pays for the app, then sends it again; any other reply is returned as it came. Without a
 * terminal or `--wait` it exits 4 with the link instead of waiting.
 */
export async function whenPaid(
  dojo: DojoClient,
  io: DojoIO,
  send: () => Promise<Response>,
): Promise<Response> {
  let polls = 0;
  let shown: string | undefined;

  for (;;) {
    const response = await send();

    if (response.status !== 402) return response;

    const refusal = await dojoError(response.clone());
    const data = refusal.body?.errors?.find((error) => error.data?.url)?.data;
    const paywall = readPaywall(refusal.message, dojo.url, data?.url);

    if (!paywall) return response;

    if (!canWait(io)) throw paymentNeeded(paywall, 'then run the command again');

    if (paywall.url !== shown) {
      showPaywall(io, paywall);
      shown = paywall.url;
    }

    polls = await untilPaid(dojo, io, paywall, polls, {
      code: refusal.body?.errors?.find((error) => error.data?.code)?.data?.code,
      status: response.status,
    });

    say(io, '[frogbot] Paid. Carrying on.');
  }
}

async function untilPaid(
  dojo: DojoClient,
  io: DojoIO,
  paywall: Paywall,
  from: number,
  { code, status }: { code?: string; status?: number },
): Promise<number> {
  let polls = from;

  do {
    polls += 1;

    if (polls > maxPolls) {
      throw new ShareError(
        `Dojo still has no payment for this app after ${(maxPolls * pollMs) / 60_000} minutes. Once it's paid, run the command again.`,
        1,
        { code: code ?? 'payment_required', status, url: paywall.url },
      );
    }

    await io.wait(pollMs);
  } while (!(await paid(dojo, paywall)));

  return polls;
}

/**
 * For a change Dojo finishes by itself once a person pays at `link`, such as keeping a preview: shows the link and
 * waits for the payment. Without a terminal or `--wait` it exits 4 with the link. A link that isn't Dojo's upgrade
 * page is only printed, and answers false.
 */
export async function waitForPayment(
  dojo: DojoClient,
  io: DojoIO,
  { link, why, then }: { link: string; why: string; then: string },
): Promise<boolean> {
  const paywall = readPaywall(why, dojo.url, link);

  if (!paywall) {
    say(io, `[frogbot] ${why} Pay for it at:`);
    say(io, link);

    return false;
  }

  if (!canWait(io)) throw paymentNeeded(paywall, then);

  showPaywall(io, paywall);
  await untilPaid(dojo, io, paywall, 0, {});

  return true;
}
