import type { DojoErrorBody } from './dojo.js';
import { ShareError } from './error.js';

/**
 * A Dojo slug from an app name: lowercase letters, digits and dashes, at most 63. Refuses a slug of
 * digits alone, which Dojo reads as an app id.
 */
export function toSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 63)
    .replace(/^-+|-+$/g, '');

  if (/^\d+$/.test(slug)) {
    throw new ShareError(
      `"${name}" would make the slug "${slug}", which reads as an app id. Add a letter.`,
      2,
    );
  }

  return slug || 'app';
}

/** Dojo refused a new app because its slug is taken. */
export function nameTaken(status: number, body: DojoErrorBody | undefined): boolean {
  if (status === 409 && body?.error === 'name_taken') return true;

  return (
    body?.errors?.some(
      (error) =>
        error.data?.code === 'name_taken' ||
        error.data?.errors?.some(
          (field) => field.path === 'slug' && field.message === 'Value must be unique',
        ),
    ) ?? false
  );
}
