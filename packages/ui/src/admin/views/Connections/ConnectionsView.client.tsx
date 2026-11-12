'use client';

import { useRef, useState } from 'react';

import { Button } from '../../../components/button.js';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/dialog.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/dropdown-menu.js';
import { SearchInput } from '../../../components/search-input.js';
import DeleteIcon from '../../../icons/icons/DeleteIcon.js';
import LinkSquareIcon from '../../../icons/icons/LinkSquareIcon.js';
import LoadingIcon from '../../../icons/icons/LoadingIcon.js';
import MoreHorizontalIcon from '../../../icons/icons/MoreHorizontalIcon.js';
import { AppConnections } from './AppConnections.client.js';
import { ConnectionForm } from './ConnectionForm.js';
import { PieceLogo } from './PieceLogo.js';
import { connectionStatus } from './status.js';
import type { ConnectionItem, ConnectionPiece, ConnectionsViewClientProps } from './types.js';

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

function ConnectionRow({
  connection,
  label,
  oauthLabel = 'OAuth',
  icon,
  scopes,
  busy,
  onDisconnect,
}: {
  connection: ConnectionItem;
  label: string;
  oauthLabel?: string;
  icon?: string;
  scopes?: string[];
  busy: boolean;
  onDisconnect: () => void;
}) {
  const status = connectionStatus(connection, scopes);

  return (
    <div className="frogbot-connections__row">
      <div className="frogbot-connections__identity">
        <PieceLogo src={icon} />
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
          {status === 'relink' ? 'needs re-link' : status}
        </span>
        <span className="frogbot-connections__muted">
          {connection.method === 'oauth' ? oauthLabel : 'Static credentials'}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="frogbot-connections__menu"
              disabled={busy}
              aria-label={`Options for ${label}`}
            >
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

export function ConnectionsViewClient({
  apiPath,
  returnTo,
  pieces,
  initialConnections,
  initialError,
  slots = [],
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
  const icons = new Map(pieces.map((piece) => [piece.slug, piece.icon]));
  const oauthLabels = new Map(pieces.map((piece) => [piece.slug, piece.oauthLabel]));
  const scopes = new Map(pieces.map((piece) => [piece.slug, piece.scopes]));
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
      {(pieces.length > 0 || slots.length === 0) && (
        <>
          <div className="frogbot-connections__toolbar">
            <SearchInput
              aria-label="Search connections"
              placeholder="Search connections…"
              value={search}
              onChange={setSearch}
            />
            <Button
              size="sm"
              className="frogbot-connections__lift"
              onClick={() => setOpen(true)}
              disabled={pieces.length === 0}
            >
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
                    className="frogbot-connections__lift"
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
                  oauthLabel={oauthLabels.get(connection.piece)}
                  icon={icons.get(connection.piece)}
                  scopes={scopes.get(connection.piece)}
                  busy={deleting === connection.id}
                  onDisconnect={() => void disconnect(connection.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
      {slots.length > 0 && <AppConnections apiPath={apiPath} returnTo={returnTo} slots={slots} />}
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
