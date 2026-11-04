import { Form } from '@frogbotai/ui/forms';
import { attachRegisteredFrogBot } from 'frogbot/internal';
import type { AdminViewServerProps } from 'payload';

import { FORMS_SLUG, RUNTIME_KEY } from './collection.js';
import { definitionFor, findForm, type FormsRuntime } from './lookup.js';

/**
 * The public page at `/forms/<slug>`. It loads the form as the visitor, so the `forms` `read`
 * rule decides, and renders it without the admin's chrome. Unknown or unreadable forms are 404.
 */
export async function FormView(props: AdminViewServerProps) {
  const { initPageResult, params, payload } = props;
  const segments = (params?.segments ?? []) as string[];

  const collection = payload.config.collections.find(({ slug }) => slug === FORMS_SLUG);
  const runtime = collection?.custom?.[RUNTIME_KEY] as FormsRuntime | undefined;

  const req = attachRegisteredFrogBot(initPageResult.req);
  const found =
    runtime && segments.length === 2 ? await findForm(req, runtime, segments[1]) : undefined;

  if (!runtime || !found || found.form.mode === 'update') return props.server.notFound();

  const definition = await definitionFor(req, runtime, found);
  const submitUrl = `${payload.config.routes.api}/${FORMS_SLUG}/${encodeURIComponent(found.form.slug)}/submit`;

  return (
    <main>
      <Form definition={definition} submitUrl={submitUrl} />
    </main>
  );
}
