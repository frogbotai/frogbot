import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/exports/pieces.js'));

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import {
  createSalesforce,
  SalesforceError,
} from '../../../packages/pieces/piece-salesforce/src/index.js';
import {
  body,
  type Call,
  calls,
  data,
  json,
  path,
  query,
  req,
  stubSalesforce,
} from './fixtures.js';

const salesforce = createSalesforce({});
const definition = pieceFactoryDefinition(createSalesforce);

type Run = (args: { input: Record<string, unknown>; req: unknown }) => Promise<unknown>;

function action(slug: string) {
  return (salesforce as unknown as Record<string, Run>)[slug];
}

afterEach(() => vi.unstubAllGlobals());

const account = '001000000000001AAA';
const contact = '003000000000001AAA';
const lead = '00Q000000000001AAA';
const campaign = '701000000000001AAA';
const opportunity = '006000000000001AAA';
const user = '005000000000001AAA';
const createdReply = { id: '00T000000000001AAA', success: true, errors: [] };
const page = {
  totalSize: 1,
  done: true,
  records: [{ attributes: { type: 'Account' }, Id: account }],
};

type Case = {
  slug: string;
  input: Record<string, unknown>;
  method: string;
  path: string;
  body?: unknown;
  query?: Record<string, string>;
  reply?: unknown;
  status?: number;
  output: unknown;
};

const cases: Case[] = [
  {
    slug: 'createRecord',
    input: { object: 'Invoice__c', fields: { Name: 'INV-1', Amount__c: 10 } },
    method: 'POST',
    path: `${data}/sobjects/Invoice__c`,
    body: { Name: 'INV-1', Amount__c: 10 },
    reply: createdReply,
    output: createdReply,
  },
  {
    slug: 'updateRecord',
    input: { object: 'Account', recordId: account, fields: { BillingCity: 'Oslo' } },
    method: 'PATCH',
    path: `${data}/sobjects/Account/${account}`,
    body: { BillingCity: 'Oslo' },
    status: 204,
    output: { id: account },
  },
  {
    slug: 'deleteRecord',
    input: { object: 'Account', recordId: account },
    method: 'DELETE',
    path: `${data}/sobjects/Account/${account}`,
    status: 204,
    output: { id: account },
  },
  {
    slug: 'searchRecords',
    input: { object: 'Account', where: "Industry = 'Tech'" },
    method: 'GET',
    path: `${data}/query`,
    query: { q: "SELECT FIELDS(ALL) FROM Account WHERE Industry = 'Tech' LIMIT 200" },
    reply: page,
    output: { ...page, nextRecordsUrl: null },
  },
  {
    slug: 'listChildRecords',
    input: { parentId: account, relationship: 'Contacts' },
    method: 'GET',
    path: `${data}/ui-api/records/${account}/child-relationships/Contacts`,
    query: {},
    reply: { count: 1, records: [{ id: contact }], nextPageToken: null },
    output: { records: [{ id: contact }], nextPageToken: null },
  },
  {
    slug: 'upsertRecords',
    input: { object: 'Account', externalIdField: 'Ext__c', records: [{ Ext__c: 'a', Name: 'A' }] },
    method: 'PATCH',
    path: `${data}/composite/sobjects/Account/Ext__c`,
    body: {
      allOrNone: false,
      records: [{ attributes: { type: 'Account' }, Ext__c: 'a', Name: 'A' }],
    },
    reply: [{ id: account, success: true, created: true, errors: [] }],
    output: { results: [{ id: account, success: true, created: true, errors: [] }] },
  },
  {
    slug: 'createCase',
    input: { subject: 'Broken', priority: 'High', accountId: account, fields: { Reason: 'Bug' } },
    method: 'POST',
    path: `${data}/sobjects/Case`,
    body: { Subject: 'Broken', Priority: 'High', AccountId: account, Reason: 'Bug' },
    reply: createdReply,
    output: createdReply,
  },
  {
    slug: 'createContact',
    input: { lastName: 'Scully', firstName: 'Dana', accountId: account, email: 'dana@acme.com' },
    method: 'POST',
    path: `${data}/sobjects/Contact`,
    body: { FirstName: 'Dana', LastName: 'Scully', AccountId: account, Email: 'dana@acme.com' },
    reply: createdReply,
    output: createdReply,
  },
  {
    slug: 'updateContact',
    input: { contactId: contact, title: 'CFO', phone: '' },
    method: 'PATCH',
    path: `${data}/sobjects/Contact/${contact}`,
    body: { Phone: '', Title: 'CFO' },
    status: 204,
    output: { id: contact },
  },
  {
    slug: 'createLead',
    input: { lastName: 'Mulder', company: 'FBI', leadSource: 'Web' },
    method: 'POST',
    path: `${data}/sobjects/Lead`,
    body: { LastName: 'Mulder', Company: 'FBI', LeadSource: 'Web' },
    reply: createdReply,
    output: createdReply,
  },
  {
    slug: 'updateLead',
    input: { leadId: lead, company: 'X-Files', fields: { Rating: 'Hot' } },
    method: 'PATCH',
    path: `${data}/sobjects/Lead/${lead}`,
    body: { Company: 'X-Files', Rating: 'Hot' },
    status: 204,
    output: { id: lead },
  },
  {
    slug: 'createNote',
    input: { parentId: account, title: 'Call', body: 'Went well' },
    method: 'POST',
    path: `${data}/sobjects/Note`,
    body: { ParentId: account, Title: 'Call', Body: 'Went well' },
    reply: createdReply,
    output: createdReply,
  },
  {
    slug: 'createOpportunity',
    input: { name: 'Big', closeDate: '2026-12-31', stageName: 'Prospecting', amount: 5000 },
    method: 'POST',
    path: `${data}/sobjects/Opportunity`,
    body: { Name: 'Big', CloseDate: '2026-12-31', StageName: 'Prospecting', Amount: 5000 },
    reply: createdReply,
    output: createdReply,
  },
  {
    slug: 'deleteOpportunity',
    input: { opportunityId: opportunity },
    method: 'DELETE',
    path: `${data}/sobjects/Opportunity/${opportunity}`,
    status: 204,
    output: { id: opportunity },
  },
  {
    slug: 'createTask',
    input: {
      subject: 'Call',
      ownerId: user,
      status: 'Not Started',
      priority: 'Normal',
      whoId: contact,
    },
    method: 'POST',
    path: `${data}/sobjects/Task`,
    body: {
      Subject: 'Call',
      OwnerId: user,
      Status: 'Not Started',
      Priority: 'Normal',
      WhoId: contact,
    },
    reply: createdReply,
    output: createdReply,
  },
  {
    slug: 'addContactToCampaign',
    input: { campaignId: campaign, contactId: contact, status: 'Sent' },
    method: 'POST',
    path: `${data}/sobjects/CampaignMember`,
    body: { CampaignId: campaign, ContactId: contact, Status: 'Sent' },
    reply: createdReply,
    output: createdReply,
  },
  {
    slug: 'addLeadToCampaign',
    input: { campaignId: campaign, leadId: lead, status: 'Responded' },
    method: 'POST',
    path: `${data}/sobjects/CampaignMember`,
    body: { CampaignId: campaign, LeadId: lead, Status: 'Responded' },
    reply: createdReply,
    output: createdReply,
  },
  {
    slug: 'sendEmail',
    input: { recipientId: contact, subject: 'Hi', body: '<p>Hi</p>', relatedToId: account },
    method: 'POST',
    path: `${data}/sobjects/EmailMessage`,
    body: {
      ToIds: [contact],
      Subject: 'Hi',
      HtmlBody: '<p>Hi</p>',
      Status: '3',
      RelatedToId: account,
    },
    reply: createdReply,
    output: createdReply,
  },
];

describe('Salesforce actions', () => {
  it.each(cases.map((entry) => [entry.slug, entry] as const))(
    '%s sends the exact request and parses its output',
    async (_slug, entry) => {
      stubSalesforce(() =>
        entry.status === 204 ? new Response(null, { status: 204 }) : json(entry.reply),
      );

      await expect(action(entry.slug)({ input: entry.input, req: req() })).resolves.toEqual(
        entry.output,
      );
      expect(calls).toHaveLength(1);
      expect(calls[0]?.method).toBe(entry.method);
      expect(path(calls[0])).toBe(entry.path);
      expect(body(calls[0])).toEqual(entry.body ?? null);

      expect(query(calls[0])).toEqual(entry.query ?? {});
    },
  );

  it('skips an update with no fields', async () => {
    stubSalesforce(() => json({}));

    await expect(
      action('updateContact')({ input: { contactId: contact }, req: req() }),
    ).resolves.toEqual({
      id: contact,
    });
    expect(calls).toHaveLength(0);
  });

  it('escapes the value of a Find Record lookup as a SOQL literal', async () => {
    stubSalesforce(() => json(page));

    await action('getRecordByField')({
      input: { object: 'Contact', field: 'LastName', value: "O'Brien\\' OR Name != '" },
      req: req(),
    });

    expect(query(calls[0]).q).toBe(
      "SELECT FIELDS(ALL) FROM Contact WHERE LastName = 'O\\'Brien\\\\\\' OR Name != \\'' LIMIT 200",
    );
  });

  it('refuses a field name that would change the query', async () => {
    stubSalesforce(() => json(page));

    await expect(
      action('getRecordByField')({
        input: { object: 'Contact', field: 'Id != null OR Name', value: 'x' },
        req: req(),
      }),
    ).rejects.toThrow('Field must be a Salesforce field API name');
    expect(calls).toHaveLength(0);
  });

  it("keeps Salesforce's errorCode, message and status", async () => {
    stubSalesforce(() =>
      json(
        [{ message: "No such column 'Foo' on entity 'Account'", errorCode: 'INVALID_FIELD' }],
        400,
      ),
    );

    const error = await action('createRecord')({
      input: { object: 'Account', fields: { Foo: 1 } },
      req: req(),
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(SalesforceError);
    expect(error).toMatchObject({
      status: 400,
      errorCode: 'INVALID_FIELD',
      message:
        "Salesforce request failed (400 INVALID_FIELD): No such column 'Foo' on entity 'Account'",
    });
  });

  it('lists classic attachments and files of a record', async () => {
    stubSalesforce((call) =>
      json({
        totalSize: 1,
        done: true,
        records: query(call).q?.includes('FROM Attachment')
          ? [
              {
                Id: '00P000000000001AAA',
                Name: 'a.pdf',
                BodyLength: 10,
                ContentType: 'application/pdf',
              },
            ]
          : [{ ContentDocument: { Id: '069000000000001AAA', Title: 'Plan' } }],
      }),
    );

    await expect(
      action('listAttachments')({ input: { recordId: account }, req: req() }),
    ).resolves.toEqual({
      attachments: [
        { Id: '00P000000000001AAA', Name: 'a.pdf', BodyLength: 10, ContentType: 'application/pdf' },
      ],
      files: [{ Id: '069000000000001AAA', Title: 'Plan' }],
    });
    expect(calls.map((call) => query(call).q).sort()).toEqual([
      `SELECT ContentDocument.Id, ContentDocument.Title FROM ContentDocumentLink WHERE LinkedEntityId = '${account}'`,
      `SELECT Id, Name, BodyLength, ContentType FROM Attachment WHERE ParentId = '${account}'`,
    ]);
  });

  it('uploads a bulk upsert job and returns once the CSV is uploaded', async () => {
    const job = '750R0000000zlh9IAA';

    stubSalesforce((call) =>
      call.method === 'PUT'
        ? new Response(null, { status: 201 })
        : json({ id: job, state: call.method === 'POST' ? 'Open' : 'UploadComplete' }),
    );

    await expect(
      action('upsertRecordsBulk')({
        input: { object: 'Account', externalIdField: 'Ext__c', csv: 'Ext__c,Name\r\na,A\r\n' },
        req: req(),
      }),
    ).resolves.toEqual({ id: job, state: 'UploadComplete' });

    expect(calls.map((call) => `${call.method} ${path(call)}`)).toEqual([
      `POST ${data}/jobs/ingest`,
      `PUT ${data}/jobs/ingest/${job}/batches`,
      `PATCH ${data}/jobs/ingest/${job}`,
    ]);
    expect(body(calls[0])).toEqual({
      object: 'Account',
      externalIdFieldName: 'Ext__c',
      contentType: 'CSV',
      operation: 'upsert',
      lineEnding: 'CRLF',
    });
    expect(calls[1]?.body).toBe('Ext__c,Name\r\na,A\r\n');
    expect(calls[1]?.headers.get('content-type')).toBe('text/csv');
    expect(body(calls[2])).toEqual({ state: 'UploadComplete' });
  });

  it('flattens a summary report into rows with their grouping', async () => {
    const report = '00O000000000001AAA';

    stubSalesforce(() =>
      json({
        attributes: { reportId: report, reportName: 'Pipeline' },
        reportMetadata: {
          detailColumns: ['OPPORTUNITY_NAME', 'AMOUNT'],
          groupingsDown: [{ name: 'STAGE_NAME' }],
        },
        reportExtendedMetadata: {
          detailColumnInfo: { OPPORTUNITY_NAME: { label: 'Name' }, AMOUNT: { label: 'Amount' } },
          groupingColumnInfo: { STAGE_NAME: { label: 'Stage' } },
        },
        groupingsDown: { groupings: [{ key: '0', label: 'Prospecting', value: 'Prospecting' }] },
        factMap: {
          '0!T': {
            rows: [
              {
                dataCells: [
                  { label: 'Big', value: 'x' },
                  { label: '$5,000', value: 5000 },
                ],
              },
            ],
          },
          'T!T': { aggregates: [] },
        },
      }),
    );

    await expect(
      action('runReport')({
        input: {
          reportId: report,
          filters: [{ column: 'AMOUNT', operator: 'greaterThan', value: '1' }],
        },
        req: req(),
      }),
    ).resolves.toEqual({
      reportId: report,
      reportName: 'Pipeline',
      columns: ['Stage', 'Name', 'Amount'],
      rows: [{ Stage: 'Prospecting', Name: 'Big', Amount: '$5,000' }],
    });
    expect(calls[0]?.method).toBe('POST');
    expect(path(calls[0])).toBe(`${data}/analytics/reports/${report}`);
    expect(query(calls[0])).toEqual({ includeDetails: 'true' });
    expect(body(calls[0])).toEqual({
      reportMetadata: {
        reportFilters: [{ column: 'AMOUNT', operator: 'greaterThan', value: '1' }],
      },
    });
  });

  it('exports a report as an Excel file in the files collection', async () => {
    const report = '00O000000000001AAA';
    const create = vi
      .fn()
      .mockResolvedValue({ id: 'file-1', url: '/api/files/file/Pipeline.xlsx' });

    stubSalesforce((call: Call) =>
      path(call).endsWith('/describe')
        ? json({ reportMetadata: { name: 'Pipeline/Q1' } })
        : new Response(new Uint8Array([1, 2, 3]), {
            headers: { 'content-type': 'application/octet-stream' },
          }),
    );

    const request = req();

    Object.assign(request.frogbot, { create, config: { files: { slug: 'files' } } });

    await expect(
      action('exportReport')({ input: { reportId: report }, req: request }),
    ).resolves.toEqual({
      fileId: 'file-1',
      name: 'Pipeline_Q1.xlsx',
      size: 3,
      url: '/api/files/file/Pipeline.xlsx',
    });
    expect(calls[1]?.headers.get('accept')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'files',
        overrideAccess: false,
        file: expect.objectContaining({ name: 'Pipeline_Q1.xlsx', size: 3 }),
      }),
    );
  });

  it('uploads a FrogBot file to Salesforce Files on a record', async () => {
    const findByID = vi.fn().mockResolvedValue({
      id: 'file-1',
      url: '/api/files/file/plan.pdf',
      filename: 'plan.pdf',
      mimeType: 'application/pdf',
    });

    stubSalesforce((call) =>
      call.url.startsWith('https://app.test/') ? new Response('PDF') : json(createdReply),
    );

    const request = req({
      url: 'https://app.test/api/run',
      headers: new Headers({ cookie: 'session=1' }),
    });

    Object.assign(request.frogbot, {
      findByID,
      config: {
        files: { slug: 'files' },
        _internal: { payloadConfig: Promise.resolve({ serverURL: 'https://app.test' }) },
      },
    });

    await expect(
      action('uploadFile')({
        input: { recordId: account, file: { fileId: 'file-1' } },
        req: request,
      }),
    ).resolves.toEqual(createdReply);
    expect(calls[0]?.headers.get('cookie')).toBe('session=1');
    expect(calls[1]?.headers.has('cookie')).toBe(false);
    expect(body(calls[1])).toEqual({
      Title: 'plan.pdf',
      PathOnClient: 'plan.pdf',
      VersionData: Buffer.from('PDF').toString('base64'),
      FirstPublishLocationId: account,
    });
  });
});

describe('Salesforce options', () => {
  type Options = Record<string, (args: { client: unknown; input: object }) => Promise<unknown>>;

  const options = (slug: string) =>
    definition.actions.find((entry) => entry.slug === slug)?.options as Options;

  it('lists queryable objects by label and an object’s fields', async () => {
    stubSalesforce((call) =>
      path(call).endsWith('/sobjects')
        ? json({
            sobjects: [
              { name: 'Zeta__c', label: 'Zeta', queryable: true },
              { name: 'Account', label: 'Account', queryable: true },
              { name: 'Hidden', label: 'Hidden', queryable: false },
            ],
          })
        : json({ fields: [{ name: 'Email', label: 'Email', picklistValues: [] }] }),
    );

    const client = await salesforce.client({ req: req() });

    await expect(options('getRecordByField').object({ client, input: {} })).resolves.toEqual([
      { label: 'Account', value: 'Account' },
      { label: 'Zeta', value: 'Zeta__c' },
    ]);
    await expect(
      options('getRecordByField').field({ client, input: { object: 'Contact' } }),
    ).resolves.toEqual([{ label: 'Email', value: 'Email' }]);
    await expect(
      options('getRecordByField').field({ client, input: { object: "x' OR" } }),
    ).resolves.toEqual([]);
  });

  it("lists a picklist's active values and a campaign's member statuses", async () => {
    stubSalesforce((call) =>
      path(call).endsWith('/describe')
        ? json({
            fields: [
              {
                name: 'StageName',
                label: 'Stage',
                picklistValues: [
                  { label: 'Prospecting', value: 'Prospecting', active: true },
                  { label: 'Old', value: 'Old', active: false },
                ],
              },
            ],
          })
        : json({ totalSize: 1, done: true, records: [{ Label: 'Sent' }] }),
    );

    const client = await salesforce.client({ req: req() });

    await expect(options('createOpportunity').stageName({ client, input: {} })).resolves.toEqual([
      { label: 'Prospecting', value: 'Prospecting' },
    ]);
    await expect(
      options('addContactToCampaign').status({ client, input: { campaignId: campaign } }),
    ).resolves.toEqual([{ label: 'Sent', value: 'Sent' }]);
    expect(query(calls[1]).q).toBe(
      `SELECT Label FROM CampaignMemberStatus WHERE CampaignId = '${campaign}'`,
    );
  });
});
