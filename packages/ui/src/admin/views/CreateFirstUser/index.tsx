import { buildFormState } from '@payloadcms/ui/utilities/buildFormState';
import type {
  AdminViewServerProps,
  SanitizedDocumentPermissions,
  SanitizedFieldsPermissions,
} from 'payload';

import { SignInButtons } from '../../elements/SignInButtons/index.js';
import { CreateFirstUserClient } from './index.client.js';

const baseClass = 'create-first-user';

/** Payload's create-first-user view with FrogBot's short form, then the sign-in buttons. */
export async function CreateFirstUserView({ initPageResult }: AdminViewServerProps) {
  const { locale, req } = initPageResult;
  const { payload } = req;
  const userSlug = payload.config.admin.user;
  const collection = payload.collections[userSlug].config;

  const fields: SanitizedFieldsPermissions = Object.fromEntries(
    collection.fields.flatMap((field) =>
      'name' in field && typeof field.name === 'string'
        ? [[field.name, { create: true, read: true, update: true, validate: true }]]
        : [],
    ),
  );

  const docPermissions: SanitizedDocumentPermissions = {
    create: true,
    delete: true,
    fields,
    read: true,
    readVersions: true,
    update: true,
    validate: true,
  };

  const { state } = await buildFormState({
    collectionSlug: userSlug,
    data: {},
    docPermissions,
    docPreferences: { fields: {} },
    locale: locale?.code,
    operation: 'create',
    renderAllFields: true,
    req,
    schemaPath: userSlug,
    skipClientConfigAuth: true,
    skipValidation: true,
  });

  return (
    <>
      <div className={baseClass}>
        <div className={`${baseClass}__header`}>
          <h1>{req.t('general:welcome')}</h1>
          <p>{req.t('authentication:beginCreateFirstUser')}</p>
        </div>
        <CreateFirstUserClient
          docPermissions={docPermissions}
          initialState={state}
          loginWithUsername={collection.auth.loginWithUsername}
          userSlug={userSlug}
        />
      </div>
      <div className="fb-create-first-user__sign-in">
        <SignInButtons payload={payload} />
      </div>
    </>
  );
}
