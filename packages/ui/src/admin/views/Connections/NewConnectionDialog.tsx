'use client';

import { useId, useRef, useState } from 'react';

import { Button } from '../../../components/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../components/dialog.js';
import { Label } from '../../../components/label.js';
import { RadioGroup, RadioGroupItem } from '../../../components/radio-group.js';
import { SearchInput } from '../../../components/search-input.js';
import ChevronLeftIcon from '../../../icons/icons/ChevronLeftIcon.js';
import LoadingIcon from '../../../icons/icons/LoadingIcon.js';
import { ConnectionFields } from './ConnectionFields.js';
import { linkError } from './linkError.js';
import { PieceLogo } from './PieceLogo.js';
import { connectionInput, initialConnectionValue } from './schema.js';
import type { ConnectionItem, ConnectionPiece, ConnectionsViewClientProps } from './types.js';

export type ConnectionMethod = ConnectionItem['method'];

function ConnectionForm({
  piece,
  initialMethod,
  apiPath,
  returnTo,
  onBack,
  onCancel,
  onCreated,
  onBusyChange,
}: {
  piece: ConnectionPiece;
  initialMethod?: ConnectionMethod;
  apiPath: string;
  returnTo: string;
  onBack: () => void;
  onCancel: () => void;
  onCreated: () => void;
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
      onCreated();
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
      <DialogHeader>
        <DialogTitle>Connect to {piece.label}</DialogTitle>
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

export function NewConnectionDialog({
  pieces,
  apiPath,
  returnTo,
  initialPiece,
  initialMethod,
  open,
  onOpenChange,
  onCreated,
}: Pick<ConnectionsViewClientProps, 'pieces' | 'apiPath' | 'returnTo'> & {
  initialPiece?: ConnectionPiece;
  initialMethod?: ConnectionMethod;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [selected, setSelected] = useState<ConnectionPiece | undefined>(initialPiece);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const query = search.trim().toLowerCase();
  const filtered = pieces.filter((piece) =>
    `${piece.label} ${piece.slug}`.toLowerCase().includes(query),
  );

  const changeOpen = (next: boolean) => {
    if (busy) return;
    if (!next) {
      setSelected(undefined);
      setSearch('');
    }

    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent
        className={`frogbot-connections__dialog${selected ? ' frogbot-connections__dialog--selected' : ''}`}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        withCloseButton={!busy}
      >
        {selected ? (
          <ConnectionForm
            key={selected.slug}
            piece={selected}
            initialMethod={selected === initialPiece ? initialMethod : undefined}
            apiPath={apiPath}
            returnTo={returnTo}
            onBack={() => setSelected(undefined)}
            onCancel={() => changeOpen(false)}
            onBusyChange={setBusy}
            onCreated={() => {
              setSelected(undefined);
              setSearch('');
              onCreated();
            }}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Select integration</DialogTitle>
              <DialogDescription>Choose an integration to connect.</DialogDescription>
            </DialogHeader>
            <SearchInput
              autoFocus
              aria-label="Search integrations"
              placeholder="Search integrations…"
              value={search}
              onChange={setSearch}
            />
            <div className="frogbot-connections__picker">
              {filtered.length === 0 && (
                <p className="frogbot-connections__empty">No integrations found</p>
              )}
              {filtered.map((piece) => (
                <button
                  key={piece.slug}
                  type="button"
                  className="frogbot-connections__piece"
                  onClick={() => setSelected(piece)}
                >
                  <PieceLogo src={piece.icon} />
                  <span>
                    <strong>{piece.label}</strong>
                    <span className="frogbot-connections__muted">
                      {[
                        piece.oauth && (piece.oauthLabel ?? 'OAuth'),
                        piece.secret && 'Static credentials',
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
