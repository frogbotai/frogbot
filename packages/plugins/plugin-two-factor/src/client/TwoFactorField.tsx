'use client';

import './styles.css';

import { Badge } from '@frogbotai/ui';
import { toast, useConfig, useRouteCache } from '@frogbotai/ui/admin';
import { useId, useState } from 'react';

import { CodeDialog, EnableDialog, ResetDialog } from './dialogs.js';

export type TwoFactorFieldProps = {
  collectionSlug: string;
  userId: string | number;
  /** Shown in the reset confirmation. */
  name: string;
  /** True on the signed-in user's own document. */
  self: boolean;
  enabled: boolean;
  /** True when `require` covers this user, so turning off is hidden. */
  required: boolean;
  canEnable: boolean;
  /** True when the signed-in user may reset this other user's two-factor sign-in. */
  canReset: boolean;
};

/** The account section for two-factor sign-in on a user's document. */
export function TwoFactorField(props: TwoFactorFieldProps) {
  const { config } = useConfig();
  const { clearRouteCache } = useRouteCache();
  const titleId = useId();
  const [enabled, setEnabled] = useState(props.enabled);

  const base = `${config.routes.api}/${props.collectionSlug}/two-factor`;

  const changed = (next: boolean) => (message: string) => {
    setEnabled(next);
    clearRouteCache();
    toast.success(message);
  };

  if (!props.self && !props.canReset) return null;

  return (
    <section aria-labelledby={titleId} className="field-type two-factor">
      <div className="two-factor__header">
        <h3 className="two-factor__title" id={titleId}>
          Two-factor sign-in
        </h3>
        <Badge variant={enabled ? 'success' : 'outline'}>{enabled ? 'On' : 'Off'}</Badge>
      </div>
      {props.self ? (
        <>
          <p className="two-factor__hint">
            {enabled
              ? 'Signing in asks for a code from your authenticator app after your password or sign-in provider.'
              : props.canEnable
                ? 'Ask for a code from an authenticator app after your password or sign-in provider.'
                : "Two-factor sign-in isn't available for your account."}
          </p>
          {enabled && props.required ? (
            <p className="two-factor__hint">
              Two-factor sign-in is required for your account, so it can&apos;t be turned off.
            </p>
          ) : null}
          <div className="two-factor__row">
            {!enabled && props.canEnable ? (
              <EnableDialog
                base={base}
                trigger={{ label: 'Turn on' }}
                onEnabled={() => {
                  setEnabled(true);
                  clearRouteCache();
                }}
              />
            ) : null}
            {enabled ? (
              <CodeDialog
                action="Create codes"
                description="Enter a code from your authenticator app. Your old recovery codes stop working."
                label="6-digit code"
                title="New recovery codes"
                trigger={{ label: 'New recovery codes', variant: 'secondary' }}
                url={`${base}/recovery-codes`}
                onDone={() => clearRouteCache()}
              />
            ) : null}
            {enabled && !props.required ? (
              <CodeDialog
                action="Turn off"
                description="Enter a code from your authenticator app or one of your recovery codes."
                label="Code or recovery code"
                title="Turn off two-factor sign-in"
                trigger={{ label: 'Turn off', variant: 'secondary' }}
                url={`${base}/disable`}
                onDone={changed(false)}
              />
            ) : null}
          </div>
          <p className="two-factor__note">
            API keys aren&apos;t affected: they keep working without a code.
          </p>
        </>
      ) : (
        <>
          <p className="two-factor__hint">
            {enabled
              ? 'Reset it when this person loses their authenticator app and recovery codes.'
              : 'This person signs in without a code.'}
          </p>
          {enabled ? (
            <div className="two-factor__row">
              <ResetDialog
                base={base}
                name={props.name}
                trigger={{ label: 'Reset two-factor sign-in', variant: 'secondary' }}
                userId={props.userId}
                onReset={changed(false)}
              />
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
