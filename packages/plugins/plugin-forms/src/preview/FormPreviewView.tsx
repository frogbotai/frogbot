import type { AdminViewServerProps } from 'payload';

import { builderFields } from '../builder/FormBuilderField.js';
import { FORMS_SLUG, RUNTIME_KEY } from '../collection.js';
import { DEFAULT_UPLOAD_LIMITS } from '../definition.js';
import type { FormsRuntime } from '../lookup.js';
import { FormPreview } from './FormPreview.js';

/**
 * The Live Preview frame of `forms` at `/forms-preview`, without the admin's chrome. It is not
 * found for anyone who can't create or update forms, since it lists the target collections' fields.
 */
export async function FormPreviewView(props: AdminViewServerProps) {
  const { initPageResult, payload } = props;
  const access = initPageResult.permissions?.collections?.[FORMS_SLUG];

  if (!access?.create && !access?.update) return props.server.notFound();

  const collection = payload.config.collections.find(({ slug }) => slug === FORMS_SLUG);
  const runtime = collection?.custom?.[RUNTIME_KEY] as FormsRuntime | undefined;

  return (
    <FormPreview
      fields={await builderFields({ payload, req: initPageResult.req })}
      limits={runtime?.uploads ?? DEFAULT_UPLOAD_LIMITS}
    />
  );
}
