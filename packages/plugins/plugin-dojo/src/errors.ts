import { defineErrors } from 'frogbot';

/** The Dojo plugin's error codes, for `POST /api/dojo/export`. */
export const dojoError = defineErrors({
  'dojo.export-unauthorized': {
    status: 401,
    title: 'Only Dojo can export this app.',
    hint: 'Send `Authorization: Bearer <DOJO_JOBS_SECRET>`.',
    exit: 3,
  },
  'dojo.export-invalid-key': {
    status: 400,
    title: 'The export key is invalid.',
    hint: 'Send `key` as `.dojo/export/<id>.db`.',
    exit: 2,
  },
  'dojo.export-not-sqlite': {
    status: 409,
    title: "This app's database isn't SQLite.",
    hint: 'Only apps on a SQLite file can be exported.',
  },
  'dojo.export-no-database': {
    status: 404,
    title: 'This app has no database yet.',
    hint: 'Start the app once, then export again.',
  },
  'dojo.export-disk-full': {
    status: 507,
    title: "The app's disk lacks room for the export.",
    hint: "Free twice the database's size on its disk, then export again.",
    retryable: true,
  },
});
