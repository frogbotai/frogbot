import { attachRegisteredFrogBot } from 'frogbot/internal';
import type { ArrayFieldServerProps } from 'payload';

import { FORMS_SLUG, RUNTIME_KEY } from '../collection.js';
import type { FormFieldInfo } from '../definition.js';
import type { FormsRuntime } from '../lookup.js';
import { listQuestionFields } from '../questions.js';
import { FormBuilder } from './FormBuilder.js';

/** Each target collection's question fields, as the save check sees them for this request. */
export async function builderFields(
  props: Pick<ArrayFieldServerProps, 'payload' | 'req'>,
): Promise<Record<string, FormFieldInfo[]>> {
  const collection = props.payload.config.collections.find(({ slug }) => slug === FORMS_SLUG);
  const runtime = collection?.custom?.[RUNTIME_KEY] as FormsRuntime | undefined;
  if (!runtime) return {};

  const req = attachRegisteredFrogBot(props.req);
  const lists = await Promise.all(
    [...runtime.targets.values()].map(
      async (target) =>
        [target.slug, await listQuestionFields({ target, targets: runtime.targets, req })] as const,
    ),
  );

  return Object.fromEntries(lists);
}

/** The builder on `forms.steps`: lists each target's question fields and renders the client part. */
export async function FormBuilderField(props: ArrayFieldServerProps) {
  const { clientField, path, permissions, readOnly, schemaPath } = props;

  return (
    <FormBuilder
      field={clientField}
      fields={await builderFields(props)}
      path={path}
      permissions={permissions}
      readOnly={readOnly}
      schemaPath={schemaPath}
    />
  );
}
