import type { ServerAdapter } from '@frogbotai/ui/admin/rsc';
import { notFound, redirect } from 'next/navigation.js';

export const nextServerAdapter: ServerAdapter = {
  notFound: () => notFound(),
  redirect: (path) => redirect(path),
};
