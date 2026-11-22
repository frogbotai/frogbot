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
  useForm,
  useRouter,
  useRouteTransition,
  type UserWithToken,
  useTranslation,
} from '@payloadcms/ui';
import type { FormState, LoginWithUsernameOptions, SanitizedDocumentPermissions } from 'payload';
import { formatAdminURL } from 'payload/shared';
import { type RefObject, useEffect, useMemo, useRef, useState } from 'react';

import { requiredFields } from './requiredFields.js';

const baseClass = 'create-first-user__form';

export type CreateFirstUserClientProps = {
  docPermissions: SanitizedDocumentPermissions;
  initialState: FormState;
  loginWithUsername?: false | LoginWithUsernameOptions;
  userSlug: string;
};

type ServerError = { message?: string; path?: string };

type FirstRegisterResponse = UserWithToken & {
  message?: string;
  errors?: (ServerError & { data?: { errors?: ServerError[] } })[];
};

type FormActions = Pick<
  ReturnType<typeof useForm>,
  'dispatchFields' | 'setIsValid' | 'setSubmitted'
>;

function FormActionsRef({ actions }: { actions: RefObject<FormActions | null> }) {
  const form = useForm();

  useEffect(() => {
    actions.current = form;
  }, [actions, form]);

  return null;
}

/**
 * Payload's first-user form, asking only for email, password and the fields the collection
 * marks required. It handles the response itself: a `202` from two-factor's `require` shows a
 * sign-in link, and no after-save form refresh runs, since that needs the session a `202` withholds.
 * A failed save puts each field error on its field, as Payload's form does, and toasts the rest.
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
  const formActions = useRef<FormActions>(null);

  const fields = useMemo(
    () =>
      requiredFields(
        getEntityConfig({ collectionSlug: userSlug })?.fields ?? [],
        loginWithUsername ? ['email', 'username'] : ['email'],
      ),
    [getEntityConfig, loginWithUsername, userSlug],
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

  const handleFirstRegister = async (
    res: Response,
    _successToast: (message: string) => void,
    errorToast: (message: string) => void,
  ) => {
    const json = (await res.json().catch(() => ({}))) as FirstRegisterResponse;

    if (res.status === 202) {
      setNeedsTwoFactor(true);

      return;
    }

    if (res.ok) {
      setUser(json);
      void startRouteTransition(() => router.push(admin));

      return;
    }

    const serverErrors = (json.errors ?? []).flatMap(({ data, ...error }) => [
      error,
      ...(data?.errors ?? []),
    ]);

    const fieldErrors = serverErrors.filter((error): error is Required<ServerError> =>
      Boolean(error.path && error.message),
    );

    if (fieldErrors.length && formActions.current) {
      formActions.current.dispatchFields({ type: 'ADD_SERVER_ERRORS', errors: fieldErrors });
      formActions.current.setIsValid(false);
      formActions.current.setSubmitted(true);
    }

    errorToast(
      serverErrors
        .filter((error) => !error.path)
        .map((error) => error.message)
        .join(' ')
        .trim() ||
        json.message?.trim() ||
        res.statusText ||
        t('error:unknown'),
    );
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
          handleResponse={handleFirstRegister}
          initialState={formInitialState}
          method="POST"
          schemaPath={userSlug}
          validationOperation="create"
        >
          <FormActionsRef actions={formActions} />
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
