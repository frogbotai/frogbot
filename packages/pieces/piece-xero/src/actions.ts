import type { PieceRunArgs } from 'frogbot/pieces';
import { z } from 'zod';

import type { XeroClient, XeroJSON } from './client.js';
import { xeroResponse } from './client.js';

const tenant = { tenantId: z.string().min(1).meta({ label: 'Organization' }) };
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const lineAmountType = z.enum(['Exclusive', 'Inclusive', 'NoTax']);
const lineItem = z.object({
  Description: z.string().min(1),
  Quantity: z.number().optional(),
  UnitAmount: z.number().optional(),
  AccountCode: z.string().optional(),
  ItemCode: z.string().optional(),
  TaxType: z.string().optional(),
  DiscountRate: z.number().optional(),
  LineItemID: z.string().optional(),
});
function apiAction<TInput extends z.ZodType>({
  slug,
  label,
  description,
  input,
  idempotent = false,
  run,
}: {
  slug: string;
  label: string;
  description: string;
  input: TInput;
  idempotent?: boolean;
  run(args: PieceRunArgs<z.output<TInput>, object, XeroClient>): Promise<unknown>;
}) {
  return {
    slug,
    label,
    description,
    input,
    output: xeroResponse,
    idempotent,
    options: {
      async tenantId({
        client,
        req,
      }: {
        client: XeroClient;
        req: { signal?: AbortSignal | null };
      }) {
        const tenants = await client.listTenants(req.signal ?? undefined);

        return tenants.map(({ tenantId, tenantName }) => ({ label: tenantName, value: tenantId }));
      },
    },
    run,
  };
}

function accountingRequest(
  client: XeroClient,
  input: { tenantId: string },
  path: string,
  method: 'GET' | 'POST' | 'PUT',
  body: XeroJSON | undefined,
  signal: AbortSignal | undefined,
) {
  return client.request({ path, method, tenantId: input.tenantId, body, signal }, xeroResponse);
}

const createOrUpdateContactInput = z.object({
  ...tenant,
  contactId: z.string().optional(),
  name: z.string().min(1),
  email: z.string().email().optional(),
});

const createOrUpdateContact = apiAction({
  slug: 'createOrUpdateContact',
  label: 'Create or update contact',
  description: 'Create a Xero contact or update one by ID.',
  input: createOrUpdateContactInput,
  async run({ input, client, req }) {
    return accountingRequest(
      client,
      input,
      `/Contacts${input.contactId ? `/${input.contactId}` : ''}`,
      'POST',
      { Contacts: [{ Name: input.name, EmailAddress: input.email }] },
      req.signal ?? undefined,
    );
  },
});

const createOrUpdateInvoiceInput = z.object({
  ...tenant,
  invoiceId: z.string().optional(),
  contactId: z.string().optional(),
  name: z.string().min(1),
  email: z.string().email().optional(),
  lineItem: lineItem,
  date: date.optional(),
  dueDate: date,
  reference: z.string().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED', 'DELETED', 'VOIDED']),
});

const createOrUpdateInvoice = apiAction({
  slug: 'createOrUpdateInvoice',
  label: 'Create or update invoice',
  description: 'Create or update an accounts-receivable invoice.',
  input: createOrUpdateInvoiceInput,
  async run({ input, client, req }) {
    return accountingRequest(
      client,
      input,
      `/Invoices${input.invoiceId ? `/${input.invoiceId}` : ''}`,
      'POST',
      {
        Invoices: [
          {
            Type: 'ACCREC',
            Contact: { ContactID: input.contactId, Name: input.name, EmailAddress: input.email },
            LineItems: [input.lineItem],
            Date: input.date,
            DueDate: input.dueDate,
            Reference: input.reference,
            Status: input.status,
          },
        ],
      },
      req.signal ?? undefined,
    );
  },
});

const allocateCreditNoteInput = z.object({
  ...tenant,
  creditNoteId: z.string().min(1),
  invoiceId: z.string().min(1),
  amount: z.number(),
  date: date.optional(),
});

const allocateCreditNote = apiAction({
  slug: 'allocateCreditNote',
  label: 'Allocate credit note',
  description: 'Allocate a credit note to an invoice.',
  input: allocateCreditNoteInput,
  async run({ input, client, req }) {
    return accountingRequest(
      client,
      input,
      `/CreditNotes/${input.creditNoteId}/Allocations`,
      'POST',
      {
        Allocations: [
          { Invoice: { InvoiceID: input.invoiceId }, Amount: input.amount, Date: input.date },
        ],
      },
      req.signal ?? undefined,
    );
  },
});

const createBankTransferInput = z.object({
  ...tenant,
  fromBankAccountId: z.string().min(1),
  toBankAccountId: z.string().min(1),
  amount: z.number(),
  date: date.optional(),
  reference: z.string().optional(),
  fromIsReconciled: z.boolean().default(false),
  toIsReconciled: z.boolean().default(false),
});

const createBankTransfer = apiAction({
  slug: 'createBankTransfer',
  label: 'Create bank transfer',
  description: 'Transfer between bank accounts.',
  input: createBankTransferInput,
  async run({ input, client, req }) {
    return accountingRequest(
      client,
      input,
      '/BankTransfers',
      'PUT',
      {
        BankTransfers: [
          {
            FromBankAccount: { AccountID: input.fromBankAccountId },
            ToBankAccount: { AccountID: input.toBankAccountId },
            Amount: input.amount,
            Date: input.date,
            Reference: input.reference,
            FromIsReconciled: input.fromIsReconciled || undefined,
            ToIsReconciled: input.toIsReconciled || undefined,
          },
        ],
      },
      req.signal ?? undefined,
    );
  },
});

const createQuoteInput = z.object({
  ...tenant,
  contactId: z.string().min(1),
  date,
  expiryDate: date.optional(),
  lineItem,
  lineAmountTypes: lineAmountType.optional(),
  reference: z.string().optional(),
  quoteNumber: z.string().optional(),
  title: z.string().optional(),
  summary: z.string().optional(),
  terms: z.string().optional(),
  status: z.literal('DRAFT').default('DRAFT'),
});
const createQuote = apiAction({
  slug: 'createQuote',
  label: 'Create quote',
  description: 'Create a draft quote.',
  input: createQuoteInput,
  async run({ input, client, req }) {
    return accountingRequest(
      client,
      input,
      '/Quotes',
      'POST',
      {
        Quotes: [
          {
            Contact: { ContactID: input.contactId },
            Date: input.date,
            ExpiryDate: input.expiryDate,
            LineItems: [input.lineItem],
            LineAmountTypes: input.lineAmountTypes,
            Reference: input.reference,
            QuoteNumber: input.quoteNumber,
            Title: input.title,
            Summary: input.summary,
            Terms: input.terms,
            Status: input.status,
          },
        ],
      },
      req.signal ?? undefined,
    );
  },
});

const sendInvoiceEmailInput = z.object({ ...tenant, invoiceId: z.string().min(1) });
const sendInvoiceEmail = {
  slug: 'sendInvoiceEmail',
  label: 'Send invoice email',
  description: 'Send a sales invoice by email.',
  input: sendInvoiceEmailInput,
  output: z.object({ success: z.literal(true) }),
  async run({
    input,
    client,
    req,
  }: PieceRunArgs<z.output<typeof sendInvoiceEmailInput>, object, XeroClient>) {
    await client.request(
      {
        path: `/Invoices/${input.invoiceId}/Email`,
        method: 'POST',
        tenantId: input.tenantId,
        signal: req.signal ?? undefined,
      },
      z.null(),
    );
    return { success: true };
  },
};

const invoiceBase = {
  ...tenant,
  contactId: z.string().min(1),
  lineItem,
  date: date.optional(),
  dueDate: date.optional(),
  lineAmountTypes: lineAmountType.optional(),
  invoiceNumber: z.string().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED']).default('DRAFT'),
};
const createBillInput = z.object(invoiceBase);
const createBill = apiAction({
  slug: 'createBill',
  label: 'Create bill',
  description: 'Create an accounts-payable bill.',
  input: createBillInput,
  async run({ input, client, req }) {
    return accountingRequest(
      client,
      input,
      '/Invoices',
      'POST',
      {
        Invoices: [
          {
            Type: 'ACCPAY',
            Contact: { ContactID: input.contactId },
            LineItems: [input.lineItem],
            Date: input.date,
            DueDate: input.dueDate,
            LineAmountTypes: input.lineAmountTypes,
            InvoiceNumber: input.invoiceNumber,
            Status: input.status,
          },
        ],
      },
      req.signal ?? undefined,
    );
  },
});

const createPaymentInput = z.object({
  ...tenant,
  invoiceId: z.string().min(1),
  accountId: z.string().min(1),
  amount: z.number(),
  date,
  reference: z.string().optional(),
  isReconciled: z.boolean().default(false),
});
const createPayment = apiAction({
  slug: 'createPayment',
  label: 'Create payment',
  description: 'Apply a payment to an invoice.',
  input: createPaymentInput,
  async run({ input, client, req }) {
    return accountingRequest(
      client,
      input,
      '/Payments',
      'PUT',
      {
        Payments: [
          {
            Invoice: { InvoiceID: input.invoiceId },
            Account: { AccountID: input.accountId },
            Amount: input.amount,
            Date: input.date,
            Reference: input.reference,
            IsReconciled: input.isReconciled || undefined,
          },
        ],
      },
      req.signal ?? undefined,
    );
  },
});

const purchaseOrderInput = z.object({
  ...tenant,
  contactId: z.string().min(1),
  lineItem,
  date: date.optional(),
  deliveryDate: date.optional(),
  lineAmountTypes: lineAmountType.optional(),
  purchaseOrderNumber: z.string().optional(),
  reference: z.string().optional(),
  brandingThemeId: z.string().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED', 'BILLED', 'DELETED']).default('DRAFT'),
  deliveryAddress: z.string().optional(),
  attentionTo: z.string().optional(),
  telephone: z.string().optional(),
  deliveryInstructions: z.string().optional(),
  expectedArrivalDate: date.optional(),
});
const createPurchaseOrder = apiAction({
  slug: 'createPurchaseOrder',
  label: 'Create purchase order',
  description: 'Create a purchase order.',
  input: purchaseOrderInput,
  async run({ input, client, req }) {
    return accountingRequest(
      client,
      input,
      '/PurchaseOrders',
      'POST',
      {
        PurchaseOrders: [
          {
            Contact: { ContactID: input.contactId },
            LineItems: [input.lineItem],
            Date: input.date,
            DeliveryDate: input.deliveryDate,
            LineAmountTypes: input.lineAmountTypes,
            PurchaseOrderNumber: input.purchaseOrderNumber,
            Reference: input.reference,
            BrandingThemeID: input.brandingThemeId,
            Status: input.status,
            DeliveryAddress: input.deliveryAddress,
            AttentionTo: input.attentionTo,
            Telephone: input.telephone,
            DeliveryInstructions: input.deliveryInstructions,
            ExpectedArrivalDate: input.expectedArrivalDate,
          },
        ],
      },
      req.signal ?? undefined,
    );
  },
});

const updatePurchaseOrderInput = z.object({
  ...tenant,
  purchaseOrderId: z.string().min(1),
  status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED', 'BILLED', 'DELETED']).optional(),
  sentToContact: z.boolean().default(false),
  deliveryAddress: z.string().optional(),
  attentionTo: z.string().optional(),
  telephone: z.string().optional(),
  deliveryInstructions: z.string().optional(),
  expectedArrivalDate: date.optional(),
});
const updatePurchaseOrder = apiAction({
  slug: 'updatePurchaseOrder',
  label: 'Update purchase order',
  description: 'Update a purchase order.',
  input: updatePurchaseOrderInput,
  idempotent: true,
  async run({ input, client, req }) {
    return accountingRequest(
      client,
      input,
      `/PurchaseOrders/${input.purchaseOrderId}`,
      'POST',
      {
        PurchaseOrders: [
          {
            PurchaseOrderID: input.purchaseOrderId,
            Status: input.status,
            SentToContact: input.sentToContact,
            DeliveryAddress: input.deliveryAddress,
            AttentionTo: input.attentionTo,
            Telephone: input.telephone,
            DeliveryInstructions: input.deliveryInstructions,
            ExpectedArrivalDate: input.expectedArrivalDate,
          },
        ],
      },
      req.signal ?? undefined,
    );
  },
});

const uploadAttachmentInput = z.object({
  ...tenant,
  resourceType: z.enum([
    'Invoices',
    'CreditNotes',
    'PurchaseOrders',
    'Quotes',
    'BankTransfers',
    'BankTransactions',
    'Contacts',
    'Accounts',
    'ManualJournals',
    'Receipts',
    'RepeatingInvoices',
  ]),
  resourceId: z.string().min(1),
  file: z.union([z.string(), z.number()]),
  fileName: z.string().min(1),
  contentType: z.string().min(1).default('application/octet-stream'),
  includeOnline: z.boolean().default(false),
});
const uploadAttachment = apiAction({
  slug: 'uploadAttachment',
  label: 'Upload attachment',
  description: 'Upload an attachment to a Xero resource.',
  input: uploadAttachmentInput,
  async run({ input, client, req }) {
    const collection = req.frogbot.config.files?.slug;
    if (!collection) throw new Error('FrogBot files are not configured.');
    const file = await req.frogbot.findByID({
      collection,
      id: input.file,
      depth: 0,
      req,
      overrideAccess: false,
    });
    const urlValue = typeof file.url === 'string' ? file.url : undefined;
    if (!urlValue) throw new Error('The selected file has no URL.');
    const payloadConfig = await req.frogbot.config._internal.payloadConfig;
    const originValue = payloadConfig.serverURL || req.url;

    if (!originValue) throw new Error('FrogBot file requests require a server URL.');

    const origin = new URL(originValue);
    const url = new URL(urlValue, origin);

    if (
      !['http:', 'https:'].includes(origin.protocol) ||
      origin.username ||
      origin.password ||
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.origin !== origin.origin
    ) {
      throw new Error('The selected file URL is unsafe.');
    }
    const response = await fetch(url, {
      headers: {
        cookie: req.headers.get('cookie') ?? '',
        authorization: req.headers.get('authorization') ?? '',
      },
      redirect: 'error',
      signal: req.signal ?? undefined,
    });
    if (!response.ok) throw new Error(`Unable to load attachment (${response.status}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > 10_000_000) throw new Error('Xero attachments cannot exceed 10 MB.');
    const suffix =
      input.includeOnline && ['Invoices', 'CreditNotes'].includes(input.resourceType)
        ? '?IncludeOnline=true'
        : '';
    return client.request(
      {
        path: `/${input.resourceType}/${input.resourceId}/Attachments/${encodeURIComponent(input.fileName)}${suffix}`,
        method: 'POST',
        tenantId: input.tenantId,
        body: bytes,
        headers: { 'Content-Type': input.contentType },
        signal: req.signal ?? undefined,
      },
      xeroResponse,
    );
  },
});

const addInvoiceItemsInput = z.object({
  ...tenant,
  invoiceId: z.string().min(1),
  newLineItems: z.array(lineItem).min(1),
});
const addInvoiceItems = apiAction({
  slug: 'addInvoiceItems',
  label: 'Add invoice items',
  description: 'Append items to a sales invoice.',
  input: addInvoiceItemsInput,
  async run({ input, client, req }) {
    const current = await client.request(
      {
        path: `/Invoices/${input.invoiceId}`,
        tenantId: input.tenantId,
        signal: req.signal ?? undefined,
      },
      z.object({
        Invoices: z
          .array(z.object({ LineItems: z.array(lineItem.passthrough()).default([]) }))
          .min(1),
      }),
    );
    return accountingRequest(
      client,
      input,
      `/Invoices/${input.invoiceId}`,
      'POST',
      {
        Invoices: [
          { Type: 'ACCREC', LineItems: [...current.Invoices[0].LineItems, ...input.newLineItems] },
        ],
      },
      req.signal ?? undefined,
    );
  },
});

const createCreditNoteInput = z.object({
  ...tenant,
  type: z.enum(['ACCRECCREDIT', 'ACCPAYCREDIT']).default('ACCRECCREDIT'),
  contactId: z.string().min(1),
  date: date.optional(),
  status: z.enum(['DRAFT', 'AUTHORISED']).default('DRAFT'),
  lineAmountTypes: lineAmountType.optional(),
  creditNoteNumber: z.string().optional(),
  reference: z.string().optional(),
  currencyCode: z.string().optional(),
  brandingThemeId: z.string().optional(),
  lineItems: z.array(lineItem).optional(),
});
const createCreditNote = apiAction({
  slug: 'createCreditNote',
  label: 'Create credit note',
  description: 'Create a credit note.',
  input: createCreditNoteInput,
  async run({ input, client, req }) {
    return accountingRequest(
      client,
      input,
      '/CreditNotes',
      'POST',
      {
        CreditNotes: [
          {
            Type: input.type,
            Contact: { ContactID: input.contactId },
            Date: input.date,
            Status: input.status,
            LineAmountTypes: input.lineAmountTypes,
            CreditNoteNumber: input.creditNoteNumber,
            Reference: input.type === 'ACCRECCREDIT' ? input.reference : undefined,
            CurrencyCode: input.currencyCode,
            BrandingThemeID: input.brandingThemeId,
            LineItems: input.lineItems,
          },
        ],
      },
      req.signal ?? undefined,
    );
  },
});

const createItemInput = z.object({
  ...tenant,
  code: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  purchaseDescription: z.string().optional(),
  isSold: z.boolean().default(true),
  isPurchased: z.boolean().default(true),
  salesDetails: z.object({ UnitPrice: z.number() }).optional(),
  purchaseDetails: z.object({ UnitPrice: z.number() }).optional(),
  salesAccountId: z.string().optional(),
  purchaseAccountId: z.string().optional(),
  cogsAccountId: z.string().optional(),
  inventoryAssetAccountId: z.string().optional(),
});
const createItem = apiAction({
  slug: 'createItem',
  label: 'Create inventory item',
  description: 'Create an inventory item.',
  input: createItemInput,
  async run({ input, client, req }) {
    return accountingRequest(
      client,
      input,
      '/Items',
      'POST',
      {
        Code: input.code,
        Name: input.name,
        Description: input.description,
        PurchaseDescription: input.purchaseDescription,
        IsSold: input.isSold,
        IsPurchased: input.isPurchased,
        SalesDetails:
          input.salesDetails || input.salesAccountId
            ? { ...input.salesDetails, AccountID: input.salesAccountId }
            : undefined,
        PurchaseDetails:
          input.purchaseDetails || input.purchaseAccountId || input.cogsAccountId
            ? {
                ...input.purchaseDetails,
                AccountID: input.purchaseAccountId,
                COGSAccountID: input.cogsAccountId,
              }
            : undefined,
        InventoryAssetAccountID: input.inventoryAssetAccountId,
      },
      req.signal ?? undefined,
    );
  },
});

const createProjectInput = z.object({
  ...tenant,
  contactId: z.string().min(1),
  name: z.string().min(1),
  deadlineUtc: z.string().datetime().optional(),
  estimateAmount: z.number().optional(),
});
const createProject = apiAction({
  slug: 'createProject',
  label: 'Create project',
  description: 'Create a Xero project.',
  input: createProjectInput,
  async run({ input, client, req }) {
    return client.request(
      {
        base: 'projects',
        path: '/Projects',
        method: 'POST',
        tenantId: input.tenantId,
        body: {
          contactId: input.contactId,
          name: input.name,
          deadlineUtc: input.deadlineUtc,
          estimateAmount: input.estimateAmount,
        },
        signal: req.signal ?? undefined,
      },
      xeroResponse,
    );
  },
});

const updateInvoiceInput = z.object({
  ...tenant,
  invoiceId: z.string().min(1),
  reference: z.string().optional(),
  dueDate: date.optional(),
  invoiceNumber: z.string().optional(),
  brandingThemeId: z.string().optional(),
  url: z.string().url().optional(),
  contactId: z.string().optional(),
  status: z.enum(['DRAFT', 'SUBMITTED', 'AUTHORISED', 'VOIDED', 'DELETED']).optional(),
  sentToContact: z.boolean().default(false),
  replaceAllLineItems: z.boolean().default(false),
  lineItems: z.array(lineItem).optional(),
});
const updateInvoice = apiAction({
  slug: 'updateInvoice',
  label: 'Update sales invoice',
  description: 'Update a sales invoice.',
  input: updateInvoiceInput,
  idempotent: true,
  async run({ input, client, req }) {
    let lineItems = input.lineItems;

    if (lineItems?.length && !input.replaceAllLineItems) {
      const current = await client.request(
        {
          path: `/Invoices/${input.invoiceId}`,
          tenantId: input.tenantId,
          signal: req.signal ?? undefined,
        },
        z.object({
          Invoices: z
            .array(z.object({ LineItems: z.array(lineItem.passthrough()).default([]) }))
            .min(1),
        }),
      );
      const updates = new Map(
        lineItems.filter((item) => item.LineItemID).map((item) => [item.LineItemID, item]),
      );
      const existing = current.Invoices[0].LineItems.map((item) => {
        const update = item.LineItemID ? updates.get(item.LineItemID) : undefined;

        if (item.LineItemID) updates.delete(item.LineItemID);

        return update ? { ...item, ...update } : item;
      });
      const additions = lineItems.filter(
        (item) => !item.LineItemID || updates.has(item.LineItemID),
      );

      lineItems = [...existing, ...additions];
    }

    return accountingRequest(
      client,
      input,
      `/Invoices/${input.invoiceId}`,
      'POST',
      {
        Invoices: [
          {
            InvoiceID: input.invoiceId,
            Type: 'ACCREC',
            Reference: input.reference,
            DueDate: input.dueDate,
            InvoiceNumber: input.invoiceNumber,
            BrandingThemeID: input.brandingThemeId,
            Url: input.url,
            Contact: input.contactId ? { ContactID: input.contactId } : undefined,
            Status: input.status,
            SentToContact: input.sentToContact,
            LineItems: lineItems,
          },
        ],
      },
      req.signal ?? undefined,
    );
  },
});

const repeatingInput = z.object({
  ...tenant,
  contactId: z.string().min(1),
  schedulePeriod: z.number().int(),
  scheduleUnit: z.enum(['WEEKLY', 'MONTHLY']),
  dueDate: z.number().int(),
  dueDateType: z.enum([
    'OFCURRENTMONTH',
    'OFFOLLOWINGMONTH',
    'DAYSAFTERBILLDATE',
    'DAYSAFTERBILLMONTH',
  ]),
  startDate: date,
  endDate: date.optional(),
  lineAmountTypes: lineAmountType.default('Exclusive'),
  currencyCode: z.string().min(1),
  status: z.enum(['DRAFT', 'AUTHORISED']).default('DRAFT'),
  reference: z.string().optional(),
  brandingThemeId: z.string().optional(),
  approvedForSending: z.boolean().default(false),
  sendCopy: z.boolean().default(false),
  markAsSent: z.boolean().default(false),
  includePdf: z.boolean().default(false),
  lineItems: z.array(lineItem).min(1),
});
const createRepeatingInvoice = apiAction({
  slug: 'createRepeatingInvoice',
  label: 'Create repeating invoice',
  description: 'Create a repeating sales invoice.',
  input: repeatingInput,
  async run({ input, client, req }) {
    if (
      input.scheduleUnit === 'WEEKLY' &&
      !['DAYSAFTERBILLDATE', 'OFFOLLOWINGMONTH'].includes(input.dueDateType)
    ) {
      throw new Error('Weekly schedules require DAYSAFTERBILLDATE or OFFOLLOWINGMONTH.');
    }
    if (
      input.scheduleUnit === 'MONTHLY' &&
      !['OFCURRENTMONTH', 'OFFOLLOWINGMONTH'].includes(input.dueDateType)
    ) {
      throw new Error('Monthly schedules require OFCURRENTMONTH or OFFOLLOWINGMONTH.');
    }
    return accountingRequest(
      client,
      input,
      '/RepeatingInvoices',
      'POST',
      {
        RepeatingInvoices: [
          {
            Type: 'ACCREC',
            Contact: { ContactID: input.contactId },
            Schedule: {
              Period: input.schedulePeriod,
              Unit: input.scheduleUnit,
              DueDate: input.dueDate,
              DueDateType: input.dueDateType,
              StartDate: input.startDate,
              EndDate: input.endDate,
            },
            LineItems: input.lineItems,
            LineAmountTypes: input.lineAmountTypes,
            CurrencyCode: input.currencyCode,
            Status: input.status,
            Reference: input.reference,
            BrandingThemeID: input.brandingThemeId,
            ApprovedForSending: input.approvedForSending || undefined,
            SendCopy: input.sendCopy || undefined,
            MarkAsSent: input.markAsSent || undefined,
            IncludePDF: input.includePdf || undefined,
          },
        ],
      },
      req.signal ?? undefined,
    );
  },
});

function lookupAction(
  slug: string,
  label: string,
  path: string,
  input: z.ZodType,
  query: (
    value: z.output<typeof lookupInput>,
  ) => Record<string, boolean | number | string | undefined>,
) {
  return apiAction({
    slug,
    label,
    description: label,
    input,
    idempotent: true,
    async run({ input: value, client, req }) {
      const parsed = lookupInput.parse(value);
      return client.request(
        { path, tenantId: parsed.tenantId, query: query(parsed), signal: req.signal ?? undefined },
        xeroResponse,
      );
    },
  });
}
const lookupInput = z.object({
  ...tenant,
  searchBy: z.string().min(1),
  value: z.string().min(1),
  page: z.number().int().positive().optional(),
});
const findContact = lookupAction(
  'findContact',
  'Find contact',
  '/Contacts',
  lookupInput,
  (input) =>
    input.searchBy === 'SEARCH_TERM'
      ? { SearchTerm: input.value, page: input.page ?? 1 }
      : {
          where: `${input.searchBy === 'ACCOUNT_NUMBER' ? 'AccountNumber' : 'Name'}=="${input.value.replaceAll('"', '\\"')}"`,
          page: input.page ?? 1,
        },
);
const findInvoice = lookupAction(
  'findInvoice',
  'Find invoice',
  '/Invoices',
  lookupInput,
  (input) =>
    input.searchBy === 'SEARCH_TERM'
      ? { SearchTerm: input.value, page: input.page ?? 1 }
      : {
          where: `${input.searchBy === 'REFERENCE' ? 'Reference' : 'InvoiceNumber'}=="${input.value.replaceAll('"', '\\"')}"`,
          page: input.page ?? 1,
        },
);
const findItem = lookupAction('findItem', 'Find item', '/Items', lookupInput, (input) => ({
  where: `${input.searchBy === 'NAME' ? 'Name' : 'Code'}=="${input.value.replaceAll('"', '\\"')}"`,
}));
const findPurchaseOrder = lookupAction(
  'findPurchaseOrder',
  'Find purchase order',
  '/PurchaseOrders',
  lookupInput,
  (input) => ({
    where: `${input.searchBy === 'REFERENCE' ? 'Reference' : 'PurchaseOrderNumber'}=="${input.value.replaceAll('"', '\\"')}"`,
    page: String(input.page ?? 1),
  }),
);

const getInvoiceHistoryInput = z.object({ ...tenant, invoiceId: z.string().min(1) });
const getInvoiceHistory = apiAction({
  slug: 'getInvoiceHistory',
  label: 'Get invoice history',
  description: 'Get invoice history.',
  input: getInvoiceHistoryInput,
  idempotent: true,
  async run({ input, client, req }) {
    return client.request(
      {
        path: `/Invoices/${input.invoiceId}/History`,
        tenantId: input.tenantId,
        signal: req.signal ?? undefined,
      },
      xeroResponse,
    );
  },
});

const createBankTransactionInput = z.object({
  ...tenant,
  type: z.enum(['SPEND', 'RECEIVE']).default('SPEND'),
  contactId: z.string().min(1),
  bankAccountId: z.string().min(1),
  lineItem,
  date: date.optional(),
  reference: z.string().optional(),
  lineAmountTypes: lineAmountType.optional(),
  isReconciled: z.boolean().default(false),
});
const createBankTransaction = apiAction({
  slug: 'createBankTransaction',
  label: 'Create bank transaction',
  description: 'Create a spend or receive transaction.',
  input: createBankTransactionInput,
  async run({ input, client, req }) {
    return accountingRequest(
      client,
      input,
      '/BankTransactions',
      'POST',
      {
        BankTransactions: [
          {
            Type: input.type,
            Contact: { ContactID: input.contactId },
            BankAccount: { AccountID: input.bankAccountId },
            LineItems: [input.lineItem],
            Date: input.date,
            Reference: input.reference,
            LineAmountTypes: input.lineAmountTypes,
            IsReconciled: input.isReconciled || undefined,
          },
        ],
      },
      req.signal ?? undefined,
    );
  },
});

const findOrCreateContact = apiAction({
  slug: 'findOrCreateContact',
  label: 'Find or create contact',
  description: 'Find a contact by name or create it.',
  input: createOrUpdateContactInput.omit({ contactId: true }),
  idempotent: true,
  async run({ input, client, req }) {
    const existing = await client.request(
      {
        path: '/Contacts',
        tenantId: input.tenantId,
        query: { where: `Name=="${input.name.replaceAll('"', '\\"')}"` },
        signal: req.signal ?? undefined,
      },
      xeroResponse,
    );
    if (Array.isArray(existing.Contacts) && existing.Contacts.length) return existing;
    return accountingRequest(
      client,
      input,
      '/Contacts',
      'POST',
      { Contacts: [{ Name: input.name, EmailAddress: input.email }] },
      req.signal ?? undefined,
    );
  },
});

const customPath = z
  .string()
  .regex(/^\/(?!\/)(?!.*[%?#\\])[A-Za-z0-9._~!$&'()*+,;=:@/-]+$/)
  .refine((value) => value.split('/').every((segment) => segment !== '.' && segment !== '..'));
const customApiInput = z.object({
  ...tenant,
  method: z.enum(['DELETE', 'GET', 'POST', 'PUT']),
  path: customPath,
  query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  body: z.json().optional(),
});
const customApiCall = apiAction({
  slug: 'customApiCall',
  label: 'Custom API call',
  description: 'Call a relative Xero accounting API path.',
  input: customApiInput,
  async run({ input, client, req }) {
    return client.request(
      {
        path: input.path,
        method: input.method,
        tenantId: input.tenantId,
        query: input.query,
        body: input.body,
        signal: req.signal ?? undefined,
      },
      xeroResponse,
    );
  },
});

export const xeroActions = [
  createOrUpdateContact,
  createOrUpdateInvoice,
  allocateCreditNote,
  createBankTransfer,
  createQuote,
  sendInvoiceEmail,
  createBill,
  createPayment,
  createPurchaseOrder,
  updatePurchaseOrder,
  uploadAttachment,
  addInvoiceItems,
  createCreditNote,
  createItem,
  createProject,
  updateInvoice,
  createRepeatingInvoice,
  findContact,
  findInvoice,
  findItem,
  findPurchaseOrder,
  getInvoiceHistory,
  createBankTransaction,
  findOrCreateContact,
  customApiCall,
];
