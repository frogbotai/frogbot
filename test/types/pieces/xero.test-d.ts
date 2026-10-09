import { createXero } from '@frogbotai/piece-xero';
import { expectTypeOf } from 'vitest';

const xero = createXero({ auth: { accessToken: 'token' } });

const _allocated = xero.allocateCreditNote({
  input: { tenantId: 'tenant', creditNoteId: 'credit', invoiceId: 'invoice', amount: 10 },
});

expectTypeOf<Parameters<typeof xero.allocateCreditNote>[0]['input']>().toEqualTypeOf<{
  tenantId: string;
  creditNoteId: string;
  invoiceId: string;
  amount: number;
  date?: string | undefined;
}>();

const _allocateCreditNoteRejectsSendInvoiceEmailInput = () =>
  // @ts-expect-error allocateCreditNote does not accept sendInvoiceEmail input
  xero.allocateCreditNote({ input: { tenantId: 'tenant', invoiceId: 'invoice' } });

const emailed = xero.sendInvoiceEmail({ input: { tenantId: 'tenant', invoiceId: 'invoice' } });

expectTypeOf(emailed).toEqualTypeOf<Promise<{ success: true }>>();

expectTypeOf<Parameters<typeof xero.findContact>[0]['input']>().toEqualTypeOf<{
  tenantId: string;
  searchBy: string;
  value: string;
  page?: number | undefined;
}>();

expectTypeOf<keyof typeof xero.triggers>().toEqualTypeOf<
  | 'contactCreated'
  | 'contactCreatedOrUpdated'
  | 'salesInvoiceCreated'
  | 'salesInvoiceUpdated'
  | 'bankTransactionCreated'
  | 'paymentCreated'
  | 'purchaseOrderCreated'
  | 'paymentReconciled'
  | 'quoteUpdated'
  | 'billCreated'
  | 'creditNoteCreated'
  | 'projectCreated'
  | 'quoteCreated'
>();

expectTypeOf(xero.triggers.contactCreated.type).toEqualTypeOf<'app'>();
expectTypeOf(xero.triggers.paymentReconciled.type).toEqualTypeOf<'polling'>();

const app = { clientId: 'client', clientSecret: 'secret' };

createXero({
  oauth: app,
  scopes: ({ defaultScopes }) => [...defaultScopes, 'payroll.employees.read'],
});

// @ts-expect-error payroll.employee.read is not a Xero scope name
createXero({ oauth: app, scopes: ['payroll.employee.read'] });
