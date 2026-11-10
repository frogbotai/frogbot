'use client';

import {
  Button,
  EmailField,
  Form,
  type FormProps,
  FormSubmit,
  PasswordField,
  TextField,
  useAuth,
  useConfig,
  useRouter,
  useRouteTransition,
  type UserWithToken,
  useTranslation,
} from '@frogbotai/ui/admin';
import type { FormState } from 'payload';
import { email, formatAdminURL, getLoginOptions, username } from 'payload/shared';

import { errorMessage } from './request.js';

export type TwoFactorLoginFormProps = {
  prefillEmail?: string;
  prefillPassword?: string;
  prefillUsername?: string;
  /** The safe admin path to land on after sign-in, also posted as `returnTo` for the code page. */
  redirect: string;
};

type Handler = NonNullable<FormProps['handleResponse']>;

const baseClass = 'login__form';

function LoginField({ type }: { type: 'email' | 'emailOrUsername' | 'username' }) {
  const { t } = useTranslation();

  if (type === 'email') {
    return (
      <EmailField
        field={{
          name: 'email',
          admin: { autoComplete: 'email' },
          label: t('general:email'),
          required: true,
        }}
        path="email"
        validate={email}
      />
    );
  }

  return (
    <TextField
      field={{
        name: 'username',
        label: t(
          type === 'username' ? 'authentication:username' : 'authentication:emailOrUsername',
        ),
        required: true,
      }}
      path="username"
      validate={type === 'username' ? username : undefined}
    />
  );
}

/**
 * The admin password form with the two-factor step: a sign-in that needs a code goes to the
 * plugin's code page, which continues to `redirect` afterwards.
 */
export function TwoFactorLoginForm({
  prefillEmail,
  prefillPassword,
  prefillUsername,
  redirect,
}: TwoFactorLoginFormProps) {
  const { config, getEntityConfig } = useConfig();
  const { t } = useTranslation();
  const { setUser } = useAuth();
  const router = useRouter();
  const { startRouteTransition } = useRouteTransition();

  const {
    admin: {
      routes: { forgot },
      user: userSlug,
    },
    routes: { admin: adminRoute, api: apiRoute },
  } = config;

  const loginWithUsername =
    getEntityConfig({ collectionSlug: userSlug }).auth?.loginWithUsername ?? false;

  const { canLoginWithEmail, canLoginWithUsername } = getLoginOptions(loginWithUsername);

  const type =
    canLoginWithEmail && canLoginWithUsername
      ? 'emailOrUsername'
      : canLoginWithUsername
        ? 'username'
        : 'email';

  const initialState: FormState = {
    password: { initialValue: prefillPassword, valid: true, value: prefillPassword },
    returnTo: { initialValue: redirect, valid: true, value: redirect },
    ...(loginWithUsername
      ? { username: { initialValue: prefillUsername, valid: true, value: prefillUsername } }
      : { email: { initialValue: prefillEmail, valid: true, value: prefillEmail } }),
  };

  const handleResponse: Handler = async (response, _successToast, errorToast) => {
    const body: unknown = await response.json().catch(() => null);
    const { twoFactor, url } = (body ?? {}) as { twoFactor?: unknown; url?: unknown };

    if (response.status === 202 && twoFactor && typeof url === 'string') {
      window.location.assign(url);

      return;
    }

    if (!response.ok) {
      errorToast(errorMessage(body, t('error:unknown')));

      return;
    }

    setUser(body as UserWithToken);
    void startRouteTransition(() => router.push(redirect));
  };

  return (
    <Form
      action={formatAdminURL({ apiRoute, path: `/${userSlug}/login` })}
      className={baseClass}
      disableSuccessStatus
      handleResponse={handleResponse}
      initialState={initialState}
      method="POST"
      waitForAutocomplete
    >
      <div className={`${baseClass}__inputWrap`}>
        <LoginField type={type} />
        <PasswordField
          field={{ name: 'password', label: t('general:password'), required: true }}
          path="password"
        />
      </div>
      <div className={`${baseClass}__actions`}>
        <FormSubmit>{t('authentication:login')}</FormSubmit>
        <Button
          buttonStyle="ghost"
          className={`${baseClass}__forgotPassword`}
          el="link"
          url={formatAdminURL({ adminRoute, path: forgot })}
        >
          {t('authentication:forgotPasswordQuestion')}
        </Button>
      </div>
    </Form>
  );
}
