'use client';

import { useId, useRef, useState } from 'react';

import { Button } from '../../../components/button.js';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/dialog.js';
import { Label } from '../../../components/label.js';
import { RadioGroup, RadioGroupItem } from '../../../components/radio-group.js';
import ChevronLeftIcon from '../../../icons/icons/ChevronLeftIcon.js';
import LoadingIcon from '../../../icons/icons/LoadingIcon.js';
import { ConnectionFields } from './ConnectionFields.js';
import { linkError } from './linkError.js';
import { connectionInput, initialConnectionValue } from './schema.js';
import type { ConnectionItem, ConnectionPiece } from './types.js';

export type ConnectionMethod = ConnectionItem['method'];

/**
 * Links `piece` by OAuth or static credentials through `apiPath`: a user's own account at the
 * connections path, or an app slot at its `/app/<name>` path.
 */
export function ConnectionForm({
  piece,
  initialMethod,
  apiPath,
  returnTo,
  onBack,
  onCancel,
  onCreated,
  onBusyChange,
  title,
}: {
  piece: ConnectionPiece;
  initialMethod?: ConnectionMethod;
  apiPath: string;
  returnTo: string;
  title?: string;
  onBack?: () => void;
  onCancel: () => void;
  onCreated: (connection: ConnectionItem) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const id = useId();
  const [method, setMethod] = useState<string>(initialMethod ?? (piece.oauth ? 'oauth' : 'secret'));
  const [value, setValue] = useState<unknown>(() =>
    piece.secretSchema ? initialConnectionValue(piece.secretSchema) : undefined,
  );

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  const submit = async () => {
    if (submitting.current) return;
    setError('');

    if (method === 'oauth') {
      submitting.current = true;
      setBusy(true);
      onBusyChange(true);

      window.location.assign(
        `${apiPath}/${encodeURIComponent(piece.slug)}/authorize?${new URLSearchParams({ returnTo })}`,
      );

      return;
    }

    if (!piece.secretSchema) {
      setError('Static credentials are not available for this integration.');

      return;
    }

    let body: string;
    try {
      body = JSON.stringify(connectionInput({ field: piece.secretSchema, value }));
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Check your credential values.');

      return;
    }

    submitting.current = true;
    setBusy(true);
    onBusyChange(true);

    try {
      const response = await fetch(`${apiPath}/${encodeURIComponent(piece.slug)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body,
      });

      if (!response.ok) {
        setError(await linkError(response));

        return;
      }

      setValue(undefined);
      onCreated((await response.json()) as ConnectionItem);
    } catch {
      setError('Could not reach the server. Please try again.');
    } finally {
      submitting.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  };

  return (
    <form
      className="frogbot-connections__form"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      {onBack && (
        <Button
          autoFocus
          type="button"
          variant="ghost"
          size="sm"
          className="frogbot-connections__back"
          disabled={busy}
          onClick={onBack}
        >
          <ChevronLeftIcon size={16} />
          Back
        </Button>
      )}
      <DialogHeader>
        <DialogTitle>{title ?? `Connect to ${piece.label}`}</DialogTitle>
        <DialogDescription>
          {method === 'oauth'
            ? 'Authorize access with your account.'
            : 'Enter your credentials to link this integration.'}
        </DialogDescription>
      </DialogHeader>
      <fieldset disabled={busy} className="frogbot-connections__form-fields">
        {piece.oauth && piece.secret && (
          <RadioGroup
            aria-label="Connection method"
            value={method}
            onValueChange={(next) => {
              setMethod(next);
              setError('');
            }}
            className="frogbot-connections__methods"
          >
            <Label className="frogbot-connections__method" htmlFor={`${id}-oauth`}>
              <RadioGroupItem id={`${id}-oauth`} value="oauth" />
              {piece.oauthLabel ?? 'OAuth'}
            </Label>
            <Label className="frogbot-connections__method" htmlFor={`${id}-secret`}>
              <RadioGroupItem id={`${id}-secret`} value="secret" />
              Static credentials
            </Label>
          </RadioGroup>
        )}
        {method === 'secret' && piece.secretSchema && (
          <ConnectionFields
            field={piece.secretSchema}
            label="Credential"
            value={value}
            onChange={setValue}
          />
        )}
      </fieldset>
      {error && (
        <p role="alert" className="frogbot-connections__error">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy || (method === 'secret' && !piece.secretSchema)}>
          {busy && <LoadingIcon className="frogbot-connections__spinner" size={16} />}
          {busy
            ? method === 'oauth'
              ? 'Redirecting…'
              : 'Connecting…'
            : method === 'oauth'
              ? `Continue with ${piece.oauthLabel ?? piece.label}`
              : 'Connect'}
        </Button>
      </DialogFooter>
    </form>
  );
}
