import { Form } from '@frogbotai/ui/forms';
import { attachRegisteredFrogBot } from 'frogbot/internal';
import type { AdminViewServerProps } from 'payload';

import { FORMS_SLUG, RUNTIME_KEY } from './collection.js';
import { openLinkLimited } from './links/resolve.js';
import { definitionFor, findForm, type FormsRuntime } from './lookup.js';

function LinkGone() {
  return (
    <main>
      <section className="fb-form">
        <h1 className="fb-form__title">This link is no longer valid</h1>
        <p className="fb-form__notice">Ask whoever sent it for a new one.</p>
      </section>
    </main>
  );
}

/**
 * The public page at `/forms/<slug>`. It loads the form as the visitor, so the `forms` `read`
 * rule decides, and renders it without the admin's chrome. Unknown or unreadable forms are 404.
 * With `?link=`, it opens the edit link's record prefilled, or one "no longer valid" page.
 */
export async function FormView(props: AdminViewServerProps) {
  const { initPageResult, params, payload, searchParams } = props;
  const segments = (params?.segments ?? []) as string[];

  const collection = payload.config.collections.find(({ slug }) => slug === FORMS_SLUG);
  const runtime = collection?.custom?.[RUNTIME_KEY] as FormsRuntime | undefined;

  const req = attachRegisteredFrogBot(initPageResult.req);
  const token = searchParams?.link;
  const submitBase = (slug: string) =>
    `${payload.config.routes.api}/${FORMS_SLUG}/${encodeURIComponent(slug)}/submit`;

  if (token !== undefined) {
    const link = typeof token === 'string' ? token : '';
    const opening =
      runtime && segments.length === 2 && link
        ? await openLinkLimited(req, runtime, segments[1], link)
        : undefined;

    if (opening?.status !== 'open') return <LinkGone />;

    return (
      <main>
        <Form
          definition={opening.definition}
          submitUrl={`${submitBase(opening.found.form.slug)}?link=${encodeURIComponent(link)}`}
        />
      </main>
    );
  }

  const found =
    runtime && segments.length === 2 ? await findForm(req, runtime, segments[1]) : undefined;

  if (!runtime || !found || found.form.mode === 'update') return props.server.notFound();

  const definition = await definitionFor(req, runtime, found);

  return (
    <main>
      <Form definition={definition} submitUrl={submitBase(found.form.slug)} />
    </main>
  );
}
