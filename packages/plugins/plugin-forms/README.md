# @frogbotai/plugin-forms

Public forms that create records in FrogBot collections.

```ts
import { formsPlugin } from '@frogbotai/plugin-forms';
import { buildConfig } from 'frogbot';

export default buildConfig({
  secret: process.env.FROGBOT_SECRET!,
  db: databaseAdapter,
  collections: [
    { slug: 'users', auth: true, fields: [] },
    {
      slug: 'leads',
      fields: [
        { name: 'email', type: 'email', required: true },
        { name: 'source', type: 'text' },
      ],
    },
  ],
  plugins: [formsPlugin({ collections: ['leads'] })],
});
```

Admins build forms in the `forms` collection: a slug, the target collection, steps of questions (each one a field of the collection), hidden URL parameters, a confirmation message or redirect, and closing rules (`status`, `closesAt`, `maxResponses`). Saving refuses a form that couldn't create a record, naming the field at fault.

Each listed collection's `access.create` becomes `isFormSubmission(req, slug) || yourRule(args)`, and the record is created with `overrideAccess: false`, so field access and hooks still run.

- `GET /api/forms/:slug/definition` returns the render definition.
- `POST /api/forms/:slug/submit` takes `{ data, params }`, keeps only the form's questions and declared parameters, and returns the confirmation or field errors, never the record.

See the [forms documentation](https://docs.frogbot.ai/plugins/forms).
