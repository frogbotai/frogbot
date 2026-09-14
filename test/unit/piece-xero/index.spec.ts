import { createHmac } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import {
  pieceInstanceRuntime,
  pieceInstanceTools,
} from '../../../packages/frogbot/src/pieces/definePiece.js';
import { xeroActions } from '../../../packages/pieces/piece-xero/src/actions.js';
import { createXeroClient } from '../../../packages/pieces/piece-xero/src/client.js';
import {
  createXero,
  xeroActionNames,
  xeroScopes,
  xeroTriggerNames,
} from '../../../packages/pieces/piece-xero/src/index.js';
import { xeroTriggers } from '../../../packages/pieces/piece-xero/src/triggers.js';
import { xeroWebhook } from '../../../packages/pieces/piece-xero/src/webhook.js';

function action(slug: string) {
  const definition = xeroActions.find((candidate) => candidate.slug === slug);

  if (!definition) throw new Error(`Missing action ${slug}.`);

  return definition;
}

function trigger(slug: string) {
  const definition = xeroTriggers.find((candidate) => candidate.slug === slug);

  if (!definition) throw new Error(`Missing trigger ${slug}.`);

  return definition;
}

function request(data = {}) {
  return {
    data,
    headers: new Headers(),
    signal: null,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('xero inventory and OAuth', () => {
  it('ports all registered actions and triggers', () => {
    const xero = createXero({ auth: { accessToken: 'token' } });

    expect(pieceInstanceTools(xero)?.map(({ slug }) => slug)).toEqual(
      xeroActionNames.map((slug) => `xero_${slug}`),
    );
    expect(xeroActionNames).toHaveLength(25);
    expect(xeroTriggerNames).toHaveLength(13);
    expect(xeroScopes).toContain('offline_access');
  });

  it('maps rotating tokens and resolves account identity', async () => {
    const xero = createXero({ auth: { accessToken: 'token' } });
    const oauth = pieceInstanceRuntime(xero).definition.oauth;
    const client = {
      listTenants: vi.fn(),
      request: vi.fn().mockResolvedValue({
        sub: 'user-1',
        email: 'frog@example.com',
        name: 'Frog',
      }),
    };

    expect(oauth?.toAuth?.({ tokens: { access_token: 'new', refresh_token: 'rotated' } })).toEqual({
      accessToken: 'new',
      refreshToken: 'rotated',
    });
    await expect(oauth?.account?.({ tokens: {}, client, req: request() })).resolves.toEqual({
      id: 'user-1',
      label: 'Frog',
      email: 'frog@example.com',
    });
    expect(client.request).toHaveBeenCalledWith(
      { base: 'identity', path: '/identity/connect/userinfo' },
      expect.anything(),
    );
  });

  it('loads every connected tenant as an organization option', async () => {
    const definition = action('createPayment');
    const client = {
      listTenants: vi.fn().mockResolvedValue([
        { tenantId: 'tenant-1', tenantName: 'One' },
        { tenantId: 'tenant-2', tenantName: 'Two' },
      ]),
      request: vi.fn(),
    };

    await expect(
      definition.options.tenantId({ client, input: {}, options: {}, req: request() }),
    ).resolves.toEqual([
      { label: 'One', value: 'tenant-1' },
      { label: 'Two', value: 'tenant-2' },
    ]);
  });
});

describe('xero transport and actions', () => {
  it('keeps requests under the API base and applies protected headers last', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ Contacts: [] }), {
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetch);
    const client = createXeroClient({ auth: { accessToken: 'secret' } });

    await client.request(
      {
        path: '/Contacts',
        method: 'POST',
        tenantId: 'tenant-1',
        headers: { Authorization: 'leak', 'Xero-Tenant-Id': 'wrong' },
        query: { page: 2, includeArchived: false },
        body: { Contacts: [{ Name: 'Frog' }] },
      },
      action('findContact').output,
    );

    expect(fetch).toHaveBeenCalledWith(
      new URL('https://api.xero.com/api.xro/2.0/Contacts?page=2&includeArchived=false'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
          'Content-Type': 'application/json',
          'Xero-Tenant-Id': 'tenant-1',
        }),
        body: JSON.stringify({ Contacts: [{ Name: 'Frog' }] }),
      }),
    );
    await expect(
      client.request({ path: '/../connections' }, action('findContact').output),
    ).rejects.toThrow('escapes its API base');
  });

  it.each(['/../connections', '/%2e%2e/connections', '/Contacts?url=https://evil.test'])(
    'rejects unsafe custom path %s',
    async (path) => {
      await expect(
        action('customApiCall').input.parseAsync({
          tenantId: 'tenant-1',
          method: 'GET',
          path,
        }),
      ).rejects.toBeDefined();
    },
  );

  it('replaces all invoice lines without fetching current lines', async () => {
    const client = { listTenants: vi.fn(), request: vi.fn().mockResolvedValue({ Invoices: [] }) };

    await action('updateInvoice').run({
      input: {
        tenantId: 'tenant-1',
        invoiceId: 'invoice-1',
        replaceAllLineItems: true,
        sentToContact: false,
        lineItems: [{ Description: 'Replacement' }],
      },
      client,
      options: {},
      req: request(),
    });

    expect(client.request).toHaveBeenCalledTimes(1);
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          Invoices: [expect.objectContaining({ LineItems: [{ Description: 'Replacement' }] })],
        }),
      }),
      expect.anything(),
    );
  });

  it('merges matching invoice lines and appends new lines', async () => {
    const client = {
      listTenants: vi.fn(),
      request: vi
        .fn()
        .mockResolvedValueOnce({
          Invoices: [{ LineItems: [{ LineItemID: 'line-1', Description: 'Old', Quantity: 1 }] }],
        })
        .mockResolvedValueOnce({ Invoices: [] }),
    };

    await action('updateInvoice').run({
      input: {
        tenantId: 'tenant-1',
        invoiceId: 'invoice-1',
        replaceAllLineItems: false,
        sentToContact: false,
        lineItems: [{ LineItemID: 'line-1', Description: 'Updated' }, { Description: 'Added' }],
      },
      client,
      options: {},
      req: request(),
    });

    expect(client.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          Invoices: [
            expect.objectContaining({
              LineItems: [
                expect.objectContaining({
                  LineItemID: 'line-1',
                  Description: 'Updated',
                  Quantity: 1,
                }),
                { Description: 'Added' },
              ],
            }),
          ],
        }),
      }),
      expect.anything(),
    );
  });

  it('rejects unsafe attachment URLs before downloading', async () => {
    const req = {
      ...request(),
      url: 'https://frog.test/actions',
      frogbot: {
        config: {
          files: { slug: 'files' },
          _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://frog.test' }) },
        },
        findByID: vi.fn().mockResolvedValue({ url: 'https://evil.test/file.pdf' }),
      },
    };

    await expect(
      action('uploadAttachment').run({
        input: {
          tenantId: 'tenant-1',
          resourceType: 'Invoices',
          resourceId: 'invoice-1',
          file: 'file-1',
          fileName: 'invoice.pdf',
          contentType: 'application/pdf',
          includeOnline: false,
        },
        client: { listTenants: vi.fn(), request: vi.fn() },
        options: {},
        req,
      }),
    ).rejects.toThrow('unsafe');
  });

  it('loads an authorized same-origin file and uploads its bytes', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('pdf'));
    vi.stubGlobal('fetch', fetch);
    const client = {
      listTenants: vi.fn(),
      request: vi.fn().mockResolvedValue({ Attachments: [] }),
    };
    const req = {
      ...request(),
      url: 'https://frog.test/actions',
      headers: new Headers({ authorization: 'Bearer local', cookie: 'session=1' }),
      frogbot: {
        config: {
          files: { slug: 'files' },
          _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://frog.test' }) },
        },
        findByID: vi.fn().mockResolvedValue({ url: '/api/files/file-1' }),
      },
    };

    await action('uploadAttachment').run({
      input: {
        tenantId: 'tenant-1',
        resourceType: 'Invoices',
        resourceId: 'invoice-1',
        file: 'file-1',
        fileName: 'invoice.pdf',
        contentType: 'application/pdf',
        includeOnline: true,
      },
      client,
      options: {},
      req,
    });

    expect(req.frogbot.findByID).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'files', id: 'file-1', req, overrideAccess: false }),
    );
    expect(fetch).toHaveBeenCalledWith(
      new URL('https://frog.test/api/files/file-1'),
      expect.objectContaining({
        headers: { authorization: 'Bearer local', cookie: 'session=1' },
        redirect: 'error',
      }),
    );
    expect(client.request).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/Invoices/invoice-1/Attachments/invoice.pdf?IncludeOnline=true',
        body: new Uint8Array(Buffer.from('pdf')),
      }),
      expect.anything(),
    );
  });
});

describe('xero webhook', () => {
  it('accepts a signed empty ITR delivery and rejects a bad signature', async () => {
    const body = Buffer.from(JSON.stringify({ events: [] }));
    const signature = createHmac('sha256', 'webhook-key').update(body).digest('base64');
    const req = {
      ...request(),
      headers: new Headers({ 'x-xero-signature': signature }),
      arrayBuffer: vi.fn().mockResolvedValue(body),
    };

    await expect(xeroWebhook.verify({ req, options: { webhookKey: 'webhook-key' } })).resolves.toBe(
      true,
    );
    await expect(
      xeroWebhook.verify({
        req: { ...req, headers: new Headers({ 'x-xero-signature': 'bad' }) },
        options: { webhookKey: 'webhook-key' },
      }),
    ).resolves.toBe(false);
    expect(xeroWebhook.parse({ req }).event).toBe('xero.events');
  });

  it('routes one app delivery to matching trigger filters and excludes bills', async () => {
    const delivery = {
      events: [
        {
          eventCategory: 'INVOICE',
          eventType: 'CREATE',
          tenantId: 'tenant-1',
          resourceUrl: 'https://api.xero.com/api.xro/2.0/Invoices/bill',
        },
        {
          eventCategory: 'INVOICE',
          eventType: 'CREATE',
          tenantId: 'tenant-2',
          resourceUrl: 'https://api.xero.com/api.xro/2.0/Invoices/other',
        },
      ],
    };
    const client = {
      listTenants: vi.fn(),
      request: vi.fn().mockResolvedValue({ Invoices: [{ InvoiceID: 'bill', Type: 'ACCPAY' }] }),
    };
    const definition = trigger('salesInvoiceCreated');

    if (definition.type !== 'app') throw new Error('Expected app trigger.');

    await expect(
      definition.run({
        input: { tenantId: 'tenant-1', fetchFullRecord: false },
        client,
        options: {},
        req: request(delivery),
      }),
    ).resolves.toHaveLength(1);
    await expect(
      definition.run({
        input: { tenantId: 'tenant-1', fetchFullRecord: true },
        client,
        options: {},
        req: request(delivery),
      }),
    ).resolves.toEqual([]);
  });

  it('requires a tenant ID for every app trigger', () => {
    const appTriggers = xeroTriggers.filter((definition) => definition.type === 'app');

    expect(appTriggers).toHaveLength(4);

    appTriggers.forEach((definition) => {
      expect(definition.input.safeParse({ fetchFullRecord: false }).success).toBe(false);
      expect(
        definition.input.safeParse({ tenantId: 'tenant-1', fetchFullRecord: false }).success,
      ).toBe(true);
    });
  });

  it('isolates multiple subscribers by their required tenant ID', async () => {
    const delivery = {
      events: [
        {
          eventCategory: 'CONTACT',
          eventType: 'CREATE',
          tenantId: 'tenant-1',
          resourceId: 'contact-1',
          resourceUrl: 'https://api.xero.com/api.xro/2.0/Contacts/contact-1',
        },
        {
          eventCategory: 'CONTACT',
          eventType: 'CREATE',
          tenantId: 'tenant-2',
          resourceId: 'contact-2',
          resourceUrl: 'https://api.xero.com/api.xro/2.0/Contacts/contact-2',
        },
      ],
    };
    const definition = trigger('contactCreated');

    if (definition.type !== 'app') throw new Error('Expected app trigger.');

    const client = { listTenants: vi.fn(), request: vi.fn() };
    const tenantOne = await definition.run({
      input: { tenantId: 'tenant-1', fetchFullRecord: false },
      client,
      options: {},
      req: request(delivery),
    });
    const tenantTwo = await definition.run({
      input: { tenantId: 'tenant-2', fetchFullRecord: false },
      client,
      options: {},
      req: request(delivery),
    });
    const mismatch = await definition.run({
      input: { tenantId: 'tenant-3', fetchFullRecord: false },
      client,
      options: {},
      req: request(delivery),
    });

    expect(tenantOne.map(({ data }) => data.resourceId)).toEqual(['contact-1']);
    expect(tenantTwo.map(({ data }) => data.resourceId)).toEqual(['contact-2']);
    expect(mismatch).toEqual([]);
  });
});

describe('xero polling', () => {
  it('continues capped pages without advancing the modification window', async () => {
    const definition = trigger('paymentCreated');

    if (definition.type !== 'polling') throw new Error('Expected polling trigger.');

    const client = {
      listTenants: vi.fn(),
      request: vi.fn().mockImplementation(({ query }) =>
        Promise.resolve({
          Payments: query.page <= 5 ? [{ PaymentID: `payment-${query.page}` }] : [],
        }),
      ),
    };
    const input = { tenantId: 'tenant-1', statuses: [], types: [], pageSize: 1 };
    const first = await definition.run({ input, client, options: {}, req: request() });

    expect(first.events).toHaveLength(5);
    expect(first.cursor).toMatchObject({ nextPage: 6, modifiedAfter: undefined });

    const second = await definition.run({
      input,
      cursor: first.cursor,
      client,
      options: {},
      req: request(),
    });

    expect(second.events).toEqual([]);
    expect(second.cursor).toMatchObject({ nextPage: 1 });
    expect(second.cursor?.modifiedAfter).toBe(first.cursor?.windowStarted);
  });

  it('tracks reconciliation transitions and applies the ACCPAY bill selector', async () => {
    const reconciled = trigger('paymentReconciled');
    const bills = trigger('billCreated');

    if (reconciled.type !== 'polling' || bills.type !== 'polling') {
      throw new Error('Expected polling triggers.');
    }

    const input = { tenantId: 'tenant-1', statuses: [], types: [], pageSize: 10 };
    const paymentClient = {
      listTenants: vi.fn(),
      request: vi
        .fn()
        .mockResolvedValue({ Payments: [{ PaymentID: 'payment-1', IsReconciled: true }] }),
    };
    const first = await reconciled.run({
      input,
      client: paymentClient,
      options: {},
      req: request(),
    });
    const second = await reconciled.run({
      input,
      cursor: first.cursor,
      client: paymentClient,
      options: {},
      req: request(),
    });

    expect(first.events).toHaveLength(1);
    expect(second.events).toHaveLength(0);

    const billClient = {
      listTenants: vi.fn(),
      request: vi.fn().mockResolvedValue({
        Invoices: [
          { InvoiceID: 'sales', Type: 'ACCREC' },
          { InvoiceID: 'bill', Type: 'ACCPAY' },
        ],
      }),
    };
    const result = await bills.run({ input, client: billClient, options: {}, req: request() });

    expect(result.events).toEqual([{ InvoiceID: 'bill', Type: 'ACCPAY' }]);
    expect(billClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.objectContaining({ where: 'Type=="ACCPAY"' }) }),
      expect.anything(),
    );
  });
});
