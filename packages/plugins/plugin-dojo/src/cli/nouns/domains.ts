import type { Noun } from '../command.js';
import type { DojoClient } from '../dojo.js';
import { dojoJSON } from '../dojo.js';
import { done } from '../io.js';
import { findApp } from './resolve.js';

type DomainReply = {
  domain: string | null;
  record: { name: string; target: string } | null;
  status: 'waiting' | 'pending' | 'live' | null;
};

const ownerNeeded = 'owner access to the app';

const statuses = {
  waiting: 'waiting for DNS',
  pending: 'getting a certificate',
  live: 'live',
};

async function domainCall(
  dojo: DojoClient,
  ref: string,
  domain?: string | null,
): Promise<DomainReply & { app: string }> {
  const app = await findApp(dojo, ref);
  const reply = await dojoJSON<DomainReply>(
    dojo,
    `/api/apps/${encodeURIComponent(String(app.id))}/domain`,
    {
      ...(domain !== undefined && { method: 'PUT', body: { domain } }),
      what: `Couldn't ${domain === undefined ? 'read' : 'change'} the domain of ${app.slug}`,
      needs: ownerNeeded,
    },
  );

  return { app: app.slug, ...reply };
}

function domainLines({ app, domain, record, status }: DomainReply & { app: string }): string[] {
  if (!domain) return [`[frogbot] ${app} has no custom domain.`];

  return [
    `${domain}  ${status ? statuses[status] : 'unknown'}`,
    ...(record && status === 'waiting'
      ? [`Add a CNAME record: ${record.name} → ${record.target}`]
      : []),
  ];
}

/** `domains get | set | clear`: an app's custom domain. */
export const domains: Noun = {
  summary: "Show, set and clear an app's custom domain.",
  verbs: {
    get: {
      summary: "Show an app's domain, its DNS record and certificate status.",
      args: '<app>',
      run: async ({ io, dojo, positionals: [ref = ''] }) => {
        const reply = await domainCall(dojo(), ref);

        done(io, reply, domainLines(reply));
      },
    },
    set: {
      summary: 'Point a domain you own at the app. Then add the CNAME record it prints.',
      args: '<app> <host>',
      run: async ({ io, dojo, positionals: [ref = '', host = ''] }) => {
        const reply = await domainCall(dojo(), ref, host);

        done(io, reply, domainLines(reply));
      },
    },
    clear: {
      summary: "Remove the app's custom domain. Its frogbot.app address stays.",
      args: '<app>',
      run: async ({ io, dojo, positionals: [ref = ''] }) => {
        const reply = await domainCall(dojo(), ref, null);

        done(io, reply, domainLines(reply));
      },
    },
  },
};
