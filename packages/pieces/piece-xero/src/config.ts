import { z } from 'zod';

export const xeroAuth = z.object({
  accessToken: z.string().min(1).meta({ label: 'Access token', secret: true }),
  refreshToken: z.string().min(1).optional().meta({ label: 'Refresh token', secret: true }),
});

export type XeroAuth = z.output<typeof xeroAuth>;

export const xeroOptions = z.object({
  webhookKey: z.string().min(1).optional().meta({ label: 'Webhook key', secret: true }),
});

export type XeroOptions = z.output<typeof xeroOptions>;

export const xeroScopes = {
  openid: 'openid',
  profile: 'profile',
  email: 'email',
  offline_access: 'offline_access',
  'accounting.contacts': 'accounting.contacts',
  'accounting.transactions': 'accounting.transactions',
  'accounting.reports.read': 'accounting.reports.read',
  'accounting.journals.read': 'accounting.journals.read',
  'accounting.budgets.read': 'accounting.budgets.read',
  'accounting.attachments': 'accounting.attachments',
  'accounting.settings': 'accounting.settings',
  projects: 'projects',
  'accounting.transactions.read': 'accounting.transactions.read',
  'accounting.contacts.read': 'accounting.contacts.read',
  'accounting.settings.read': 'accounting.settings.read',
  'accounting.attachments.read': 'accounting.attachments.read',
  'payroll.employees': 'payroll.employees',
  'payroll.employees.read': 'payroll.employees.read',
  'payroll.payruns': 'payroll.payruns',
  'payroll.payruns.read': 'payroll.payruns.read',
  'payroll.payslip': 'payroll.payslip',
  'payroll.payslip.read': 'payroll.payslip.read',
  'payroll.timesheets': 'payroll.timesheets',
  'payroll.timesheets.read': 'payroll.timesheets.read',
  'payroll.settings': 'payroll.settings',
  'payroll.settings.read': 'payroll.settings.read',
  files: 'files',
  'files.read': 'files.read',
  assets: 'assets',
  'assets.read': 'assets.read',
  'projects.read': 'projects.read',
} as const;
