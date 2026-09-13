'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
  RadioGroup,
  RadioGroupItem,
  SearchInput,
} from '@frogbotai/ui';
import {
  ChevronLeftIcon,
  DeleteIcon,
  LinkSquareIcon,
  LoadingIcon,
  MoreHorizontalIcon,
} from '@frogbotai/ui/icons';
import { ThemeProvider } from '@frogbotai/ui/theme';
import { useTheme } from '@payloadcms/ui';
import { useId, useRef, useState } from 'react';

import { ConnectionFields } from './ConnectionFields.js';
import { connectionInput, initialConnectionValue } from './schema.js';
import type { ConnectionItem, ConnectionPiece, ConnectionsViewClientProps } from './types.js';

function ConnectionForm({
  piece,
  apiPath,
  returnTo,
  onBack,
  onCancel,
  onCreated,
  onBusyChange,
}: {
  piece: ConnectionPiece;
  apiPath: string;
  returnTo: string;
  onBack: () => void;
  onCancel: () => void;
  onCreated: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const id = useId();
  const [method, setMethod] = useState(piece.oauth ? 'oauth' : 'secret');
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
        setError(
          response.status === 401
            ? 'Your session has expired. Sign in and try again.'
            : response.status === 400
              ? 'These credentials were not accepted. Check the values and try again.'
              : 'Could not create the connection. Please try again.',
        );
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
              OAuth
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
              ? `Continue with ${piece.label}`
              : 'Connect'}
        </Button>
      </DialogFooter>
    </form>
  );
}

function NewConnectionDialog({
  pieces,
  apiPath,
  returnTo,
  open,
  onOpenChange,
  onCreated,
}: Pick<ConnectionsViewClientProps, 'pieces' | 'apiPath' | 'returnTo'> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [selected, setSelected] = useState<ConnectionPiece>();
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
                  <span className="frogbot-connections__icon">
                    <LinkSquareIcon size={20} />
                  </span>
                  <span>
                    <strong>{piece.label}</strong>
                    <span className="frogbot-connections__muted">
                      {[piece.oauth && 'OAuth', piece.secret && 'Static credentials']
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

function ConnectionRow({
  connection,
  label,
  busy,
  onDisconnect,
}: {
  connection: ConnectionItem;
  label: string;
  busy: boolean;
  onDisconnect: () => void;
}) {
  const expired =
    connection.status === 'active' &&
    connection.expiresAt &&
    Date.parse(connection.expiresAt) <= Date.now();
  const status = expired ? 'expired' : connection.status;
  return (
    <div className="frogbot-connections__row">
      <div className="frogbot-connections__identity">
        <span className="frogbot-connections__icon">
          <LinkSquareIcon size={20} />
        </span>
        <div>
          <strong>{connection.account?.label || connection.account?.email || label}</strong>
          <span className="frogbot-connections__muted">
            {label}
            {connection.account?.email && connection.account.email !== connection.account.label
              ? ` · ${connection.account.email}`
              : ''}
          </span>
        </div>
      </div>
      <div className="frogbot-connections__row-actions">
        <span className={`frogbot-connections__status frogbot-connections__status--${status}`}>
          {status}
        </span>
        <span className="frogbot-connections__muted">
          {connection.method === 'oauth' ? 'OAuth' : 'Static credentials'}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" disabled={busy} aria-label={`Options for ${label}`}>
              {busy ? (
                <LoadingIcon className="frogbot-connections__spinner" size={16} />
              ) : (
                <MoreHorizontalIcon size={16} />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="frogbot-connections__disconnect" onSelect={onDisconnect}>
              <DeleteIcon size={16} />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ConnectionsViewInner({
  apiPath,
  returnTo,
  pieces,
  initialConnections,
  initialError,
}: ConnectionsViewClientProps) {
  const [connections, setConnections] = useState(initialConnections);
  const [error, setError] = useState(initialError ?? '');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState<number | string>();
  const requestID = useRef(0);
  const removing = useRef(false);
  const labels = new Map(pieces.map((piece) => [piece.slug, piece.label]));
  const query = search.trim().toLowerCase();
  const filtered = connections.filter((connection) =>
    [
      connection.piece,
      labels.get(connection.piece),
      connection.account?.label,
      connection.account?.email,
    ]
      .join(' ')
      .toLowerCase()
      .includes(query),
  );

  const refresh = async () => {
    const request = ++requestID.current;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${apiPath}?limit=0&depth=0`, {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('Could not load your linked accounts. Please try again.');
      const data = (await response.json()) as { docs?: ConnectionItem[] };
      if (!Array.isArray(data.docs)) {
        throw new Error('Could not load your linked accounts. Please try again.');
      }
      if (request === requestID.current) setConnections(data.docs);
    } catch {
      if (request === requestID.current) {
        setError('Could not load your linked accounts. Please try again.');
      }
    } finally {
      if (request === requestID.current) setLoading(false);
    }
  };

  const disconnect = async (id: number | string) => {
    if (removing.current) return;
    removing.current = true;
    setDeleting(id);
    setError('');
    try {
      const response = await fetch(`${apiPath}/${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Could not disconnect this account. Please try again.');
      setConnections((current) => current.filter((connection) => connection.id !== id));
      await refresh();
    } catch {
      setError('Could not disconnect this account. Please try again.');
    } finally {
      removing.current = false;
      setDeleting(undefined);
    }
  };

  return (
    <div className="frogbot-connections">
      <div className="frogbot-connections__toolbar">
        <SearchInput
          aria-label="Search connections"
          placeholder="Search connections…"
          value={search}
          onChange={setSearch}
        />
        <Button size="sm" onClick={() => setOpen(true)} disabled={pieces.length === 0}>
          + New Connection
        </Button>
      </div>
      {error && (
        <div className="frogbot-connections__error" role="alert">
          <span>{error}</span>
          <Button variant="outline" size="sm" disabled={loading} onClick={() => void refresh()}>
            Try again
          </Button>
        </div>
      )}
      {loading ? (
        <div role="status" className="frogbot-connections__empty">
          <LoadingIcon size={24} className="frogbot-connections__spinner" />
          <span>Loading connections…</span>
        </div>
      ) : filtered.length === 0 ? (
        error ? null : (
          <div className="frogbot-connections__empty frogbot-connections__empty--bordered">
            <LinkSquareIcon size={32} />
            <p>{query ? 'No connections match your search' : 'No connections yet'}</p>
            {!query && (
              <Button
                variant="outline"
                size="sm"
                disabled={pieces.length === 0}
                onClick={() => setOpen(true)}
              >
                Add your first connection
              </Button>
            )}
          </div>
        )
      ) : (
        <div className="frogbot-connections__rows">
          {filtered.map((connection) => (
            <ConnectionRow
              key={connection.id}
              connection={connection}
              label={labels.get(connection.piece) ?? connection.piece}
              busy={deleting === connection.id}
              onDisconnect={() => void disconnect(connection.id)}
            />
          ))}
        </div>
      )}
      <NewConnectionDialog
        pieces={pieces}
        apiPath={apiPath}
        returnTo={returnTo}
        open={open}
        onOpenChange={setOpen}
        onCreated={() => {
          setOpen(false);
          void refresh();
        }}
      />
    </div>
  );
}

export function ConnectionsViewClient(props: ConnectionsViewClientProps) {
  const { theme } = useTheme();
  return (
    <ThemeProvider mode={theme}>
      <ConnectionsViewInner {...props} />
    </ThemeProvider>
  );
}
