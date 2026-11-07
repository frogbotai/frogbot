import type { DojoErrorBody } from './dojo.js';

/** A Dojo slug from an app name: lowercase letters, digits and dashes, at most 63. */
export function toSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 63)
    .replace(/^-+|-+$/g, '');

  return slug || 'app';
}

/** Dojo refused a new app because its slug is taken. */
export function nameTaken(status: number, body: DojoErrorBody | undefined): boolean {
  if (status === 409 && body?.error === 'name_taken') return true;

  return (
    body?.errors?.some((error) =>
      error.data?.errors?.some(
        (field) => field.path === 'slug' && field.message === 'Value must be unique',
      ),
    ) ?? false
  );
}
