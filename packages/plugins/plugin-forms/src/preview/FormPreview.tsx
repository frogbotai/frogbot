'use client';

import './styles.css';

import { useLivePreview } from '@frogbotai/live-preview-react';
import { Form } from '@frogbotai/ui/forms';

import { buildDefinition, type FormFieldInfo, type UploadLimits } from '../definition.js';
import type { FormDefinition, FormDocument } from '../types.js';

export type FormPreviewProps = {
  /** Each target collection's fields, by slug, from `listQuestionFields`. */
  fields: Record<string, FormFieldInfo[]>;
  /** The app's upload limits, which set a file question's default size. */
  limits: UploadLimits;
};

/**
 * The Live Preview page of a form: Payload's admin sends the unsaved form on each change, and it
 * renders as visitors would get it, with sending off. A form has nothing to populate, so the sent
 * values are used as they are, without Live Preview's round trip to the API.
 */
export function FormPreview({ fields, limits }: FormPreviewProps) {
  const { data } = useLivePreview<Partial<FormDocument>>({
    depth: 0,
    initialData: {},
    requestHandler: ({ data: sent }) => Promise.resolve(Response.json(sent.data)),
    serverURL: typeof window === 'undefined' ? '' : window.location.origin,
  });

  const form: FormDocument = { id: '', title: '', slug: '', collection: '', ...data };
  const definition: FormDefinition = {
    ...buildDefinition({ form, fields: fields[form.collection] ?? [], closed: false, limits }),
    honeypot: 'preview',
  };

  const shape = definition.steps.map(({ questions }) => questions.map(({ key }) => key).join(','));
  const empty = definition.steps.every(({ questions }) => questions.length === 0);

  return (
    <main className="fb-form-preview">
      <p className="fb-form-preview__note" role="note">
        Preview: nothing is sent.
      </p>
      {empty ? (
        <section className="fb-form">
          <h1 className="fb-form__title">{definition.title}</h1>
          <p className="fb-form__notice">Add a question to see the form.</p>
        </section>
      ) : (
        <Form definition={definition} key={shape.join('|')} />
      )}
    </main>
  );
}
