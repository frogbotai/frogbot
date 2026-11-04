import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { buildTriggerEndpoints } from '../../../packages/frogbot/src/triggers/endpoints.js';
import { createSalesforce } from '../../../packages/pieces/piece-salesforce/src/index.js';
import { auth, req } from './fixtures.js';

const org = '00D000000000001AAA';
const subscribedPost = buildTriggerEndpoints().find(({ path }) => path.endsWith('/:subscription'))!;

afterEach(() => vi.unstubAllGlobals());

function notification(id: string, name: string) {
  return `<Notification>
    <Id>${id}</Id>
    <sObject xsi:type="sf:Account" xmlns:sf="urn:sobject.enterprise.soap.sforce.com">
      <sf:Id>001000000000001AAA</sf:Id>
      <sf:Name>${name}</sf:Name>
      <sf:Phone>0123</sf:Phone>
      <sf:Description xsi:nil="true"/>
    </sObject>
  </Notification>`;
}

function envelope(organizationId: string, ...items: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Body>
    <notifications xmlns="http://soap.sforce.com/2005/09/outbound">
      <OrganizationId>${organizationId}</OrganizationId>
      <ActionId>04k000000000001AAA</ActionId>
      <SessionId xsi:nil="true"/>
      <EnterpriseUrl>https://acme.my.salesforce.com/services/Soap/c/68.0/00D000000000001</EnterpriseUrl>
      <PartnerUrl>https://acme.my.salesforce.com/services/Soap/u/68.0/00D000000000001</PartnerUrl>
      ${items.join('\n')}
    </notifications>
  </soapenv:Body>
</soapenv:Envelope>`;
}

function kv() {
  const values = new Set<string>();

  return {
    has: vi.fn((key: string) => Promise.resolve(values.has(key))),
    setIfAbsent: vi.fn((key: string) => {
      values.add(key);

      return Promise.resolve(true);
    }),
    lock: vi.fn((_key, _ttl, fn) => Promise.resolve(fn({ signal: new AbortController().signal }))),
  };
}

function deliver(xml: string) {
  const instance = createSalesforce({});
  const frogbot = {
    ...req().frogbot,
    config: {
      _internal: {
        triggers: {
          salesforce: {
            instance,
            subscribers: [
              {
                agentSlug: 'sales',
                piece: instance,
                trigger: { trigger: instance.triggers.newOutboundMessage, handler: vi.fn() },
                input: {},
              },
            ],
          },
        },
      },
    },
    find: vi.fn().mockResolvedValue({
      docs: [
        {
          id: 42,
          agent: 'sales',
          instance: 'salesforce',
          trigger: 'newOutboundMessage',
          status: 'active',
          input: { value: {} },
          state: { organizationId: org },
        },
      ],
    }),
    kv: kv(),
    queue: vi.fn(),
  };

  const request = Object.assign(
    new Request('https://app.test/api/webhooks/salesforce/42', {
      method: 'POST',
      headers: { 'content-type': 'text/xml; charset=utf-8', soapaction: '""' },
      body: xml,
    }),
    { context: {}, routeParams: { instance: 'salesforce', subscription: '42' }, frogbot },
  );

  return { response: subscribedPost.handler(request as never), frogbot };
}

describe('newOutboundMessage', () => {
  it('turns each notification into an event keyed by its ID and answers with the SOAP Ack', async () => {
    const { response, frogbot } = deliver(
      envelope(
        org,
        notification('04l000000000001AAA', 'Acme &amp; Co'),
        notification('04l000000000002AAA', 'Globex'),
      ),
    );

    const reply = await response;

    expect(reply.status).toBe(200);
    expect(reply.headers.get('content-type')).toBe('text/xml; charset=utf-8');
    expect(await reply.text()).toContain(
      '<notificationsResponse xmlns="http://soap.sforce.com/2005/09/outbound">',
    );
    expect(frogbot.queue).toHaveBeenCalledTimes(2);
    expect(
      frogbot.queue.mock.calls.map(([job]) => (job as { input: { event: unknown } }).input.event),
    ).toEqual([
      {
        dedupeKey: '04l000000000001AAA',
        data: {
          notificationId: '04l000000000001AAA',
          actionId: '04k000000000001AAA',
          organizationId: org,
          object: 'Account',
          record: { Id: '001000000000001AAA', Name: 'Acme & Co', Phone: '0123', Description: null },
        },
      },
      expect.objectContaining({ dedupeKey: '04l000000000002AAA' }),
    ]);
  });

  it('acknowledges and drops a message from another org', async () => {
    const { response, frogbot } = deliver(
      envelope('00D000000000009ZZZ', notification('04l000000000001AAA', 'Acme')),
    );

    const reply = await response;

    expect(reply.status).toBe(200);
    expect(await reply.text()).toContain('<Ack>true</Ack>');
    expect(frogbot.queue).not.toHaveBeenCalled();
  });

  it('matches the org by its 15-character ID', async () => {
    const { response, frogbot } = deliver(
      envelope(org.slice(0, 15), notification('04l000000000001AAA', 'Acme')),
    );

    await response;

    expect(frogbot.queue).toHaveBeenCalledOnce();
  });

  it("keeps the connection's org ID as subscription state", async () => {
    const instance = createSalesforce({});
    const trigger = instance.triggers.newOutboundMessage as unknown as {
      onEnable(args: object): Promise<unknown>;
    };

    const client = await instance.client({ req: req() });

    await expect(
      trigger.onEnable({ client, input: {}, webhookUrl: 'https://app.test/x', req: req() }),
    ).resolves.toEqual({
      organizationId: org,
    });

    const manual = await instance.client({
      req: req({
        frogbot: {
          connections: {
            resolvePieceCredential: vi
              .fn()
              .mockResolvedValue({ auth: { ...auth, identityUrl: undefined }, key: {} }),
          },
        },
      }),
    });

    await expect(trigger.onEnable({ client: manual, input: {}, req: req() })).rejects.toThrow(
      'Salesforce Outbound Messages need a connection made through Salesforce sign-in.',
    );
  });
});
