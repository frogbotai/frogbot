'use client';

import type { TFunction } from '@payloadcms/translations';
import {
  Button,
  ConfirmPasswordField,
  DocumentInfoProvider,
  EmailAndUsernameFields,
  Form,
  FormSubmit,
  OperationProvider,
  PasswordField,
  RenderFields,
  useAuth,
  useConfig,
  useRouter,
  useRouteTransition,
  type UserWithToken,
  useTranslation,
} from '@payloadcms/ui';
import type { FormState, LoginWithUsernameOptions, SanitizedDocumentPermissions } from 'payload';
import { formatAdminURL } from 'payload/shared';
import { useMemo, useState } from 'react';

import { requiredFields } from './requiredFields.js';

const baseClass = 'create-first-user__form';

export type CreateFirstUserClientProps = {
  docPermissions: SanitizedDocumentPermissions;
  initialState: FormState;
  loginWithUsername?: false | LoginWithUsernameOptions;
  userSlug: string;
};

/**
 * Payload's first-user form, asking only for email, password and the fields the collection
 * marks required. A `202` from two-factor's `require` shows a sign-in link instead of signing in.
 */
export function CreateFirstUserClient({
  docPermissions,
  initialState,
  loginWithUsername,
  userSlug,
}: CreateFirstUserClientProps) {
  const {
    config: {
      admin: {
        routes: { login },
      },
      routes: { admin, api: apiRoute },
    },
    getEntityConfig,
  } = useConfig();

  const { t } = useTranslation();
  const { setUser, user } = useAuth();
  const router = useRouter();
  const { startRouteTransition } = useRouteTransition();
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);

  const fields = useMemo(
    () => requiredFields(getEntityConfig({ collectionSlug: userSlug })?.fields ?? []),
    [getEntityConfig, userSlug],
  );

  const formInitialState = useMemo<FormState>(
    () => ({
      ...initialState,
      'confirm-password': {
        ...initialState['confirm-password'],
        valid: initialState['confirm-password']?.valid || false,
        value: initialState['confirm-password']?.value || '',
      },
    }),
    [initialState],
  );

  if (needsTwoFactor) {
    return (
      <div className={`${baseClass}__two-factor`}>
        <p>Account created. Sign in to set up two-factor.</p>
        <Button el="link" size="large" url={formatAdminURL({ adminRoute: admin, path: login })}>
          {t('authentication:login')}
        </Button>
      </div>
    );
  }

  const handleFirstRegister = (json: unknown) => {
    if ((json as { twoFactor?: unknown }).twoFactor) {
      setNeedsTwoFactor(true);

      return;
    }

    setUser(json as UserWithToken);
    void startRouteTransition(() => router.push(admin));
  };

  return (
    <DocumentInfoProvider
      collectionSlug={userSlug}
      currentEditor={user!}
      docPermissions={docPermissions}
      hasPublishedDoc={false}
      initialData={{}}
      initialState={initialState}
      isLocked={false}
      lastUpdateTime={0}
      mostRecentVersionIsAutosaved={false}
      unpublishedVersionCount={0}
      versionCount={0}
    >
      <OperationProvider operation="create">
        <Form
          action={formatAdminURL({ apiRoute, path: `/${userSlug}/first-register` })}
          className={baseClass}
          disableSuccessStatus
          initialState={formInitialState}
          method="POST"
          onSuccess={handleFirstRegister}
          schemaPath={userSlug}
          validationOperation="create"
        >
          <div className={`${baseClass}__inputWrap`}>
            <EmailAndUsernameFields
              loginWithUsername={loginWithUsername}
              operation="create"
              readOnly={false}
              t={t as TFunction}
            />
            <PasswordField
              autoComplete="off"
              field={{ name: 'password', label: t('authentication:newPassword'), required: true }}
              path="password"
            />
            <ConfirmPasswordField />
            <RenderFields
              fields={fields}
              forceRender
              parentIndexPath=""
              parentPath=""
              parentSchemaPath={userSlug}
              permissions={true}
              readOnly={false}
            />
          </div>
          <div className={`${baseClass}__actions`}>
            <FormSubmit size="large">{t('authentication:createUser')}</FormSubmit>
          </div>
        </Form>
      </OperationProvider>
    </DocumentInfoProvider>
  );
}
