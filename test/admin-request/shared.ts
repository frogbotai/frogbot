export const usersSlug = 'users';
export const pagesSlug = 'admin-request-pages';
export const brokenPagesSlug = 'admin-request-broken-pages';
export const filesSlug = 'files';
export const layoutBlockSlug = 'hero';
export const bodyBlockSlug = 'callout';
export const previewFailureMessage = 'preview service down';

export const pageSlots = [
  'defaultValue',
  'access.read',
  'validate',
  'relationship.filterOptions',
  'upload.filterOptions',
  'select.filterOptions',
  'blocks.filterOptions',
] as const;

export const bodyBlockSlots = ['body.defaultValue', 'body.validate'] as const;
