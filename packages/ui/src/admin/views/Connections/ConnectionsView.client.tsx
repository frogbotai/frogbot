'use client';

import { useRef, useState } from 'react';

import { Button } from '../../../components/button.js';
import { SearchInput } from '../../../components/search-input.js';
import LinkSquareIcon from '../../../icons/icons/LinkSquareIcon.js';
import LoadingIcon from '../../../icons/icons/LoadingIcon.js';
import { AppConnections } from './AppConnections.client.js';
import type { ConnectionMethod } from './ConnectionForm.js';
import { type ConnectionAction, ConnectionGroup } from './ConnectionGroup.js';
import { NewConnectionDialog } from './NewConnectionDialog.js';
import type { ConnectionItem, ConnectionPiece, ConnectionsViewClientProps } from './types.js';

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
  const [dialog, setDialog] = useState<{
    key: number;
    piece?: ConnectionPiece;
    method?: ConnectionMethod;
  }>({ key: 0 });

  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<number | string>();
  const requestID = useRef(0);
  const acting = useRef(false);
  const bySlug = new Map(pieces.map((piece) => [piece.slug, piece]));
  const query = search.trim().toLowerCase();
  const filtered = connections.filter((connection) =>
    [
      connection.piece,
      bySlug.get(connection.piece)?.label,
      connection.account?.label,
      connection.account?.email,
    ]
      .join(' ')
      .toLowerCase()
      .includes(query),
  );

  const groups = new Map<string, ConnectionItem[]>();

  for (const connection of filtered) {
    groups.set(connection.piece, [...(groups.get(connection.piece) ?? []), connection]);
  }

  const openDialog = (piece?: ConnectionPiece, method?: ConnectionMethod) => {
    setDialog(({ key }) => ({ key: key + 1, piece, method }));
    setOpen(true);
  };

  const authorize = (slug: string, reconnect?: number | string) => {
    window.location.assign(
      `${apiPath}/${encodeURIComponent(slug)}/authorize?${new URLSearchParams({
        returnTo,
        ...(reconnect === undefined ? {} : { reconnect: String(reconnect) }),
      })}`,
    );
  };

  const refresh = async () => {
    const request = ++requestID.current;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${apiPath}?limit=0&depth=0&sort=createdAt`, {
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

  const send = async (
    connection: ConnectionItem,
    { path, method, failure }: { path: string; method: string; failure: string },
    update: (current: ConnectionItem[]) => ConnectionItem[],
  ) => {
    if (acting.current) return;
    acting.current = true;
    setPending(connection.id);
    setError('');
    try {
      const response = await fetch(
        `${apiPath}/${encodeURIComponent(String(connection.id))}${path}`,
        {
          method,
          credentials: 'same-origin',
        },
      );

      if (!response.ok) throw new Error(failure);
      setConnections(update);
      await refresh();
    } catch {
      setError(failure);
    } finally {
      acting.current = false;
      setPending(undefined);
    }
  };

  const act = (connection: ConnectionItem, action: ConnectionAction) => {
    const piece = bySlug.get(connection.piece);

    if (action === 'reconnect') {
      if (!piece) return;
      if (connection.method === 'oauth') authorize(piece.slug, connection.id);
      else openDialog(piece, 'secret');

      return;
    }

    void send(
      connection,
      action === 'default'
        ? {
            path: '/default',
            method: 'POST',
            failure: 'Could not set the default account. Please try again.',
          }
        : {
            path: '',
            method: 'DELETE',
            failure: 'Could not disconnect this account. Please try again.',
          },
      (current) =>
        action === 'default'
          ? current.map((item) =>
              item.piece === connection.piece
                ? { ...item, isDefault: item.id === connection.id }
                : item,
            )
          : current.filter((item) => item.id !== connection.id),
    );
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
              onClick={() => openDialog()}
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
                    onClick={() => openDialog()}
                  >
                    Add your first connection
                  </Button>
                )}
              </div>
            )
          ) : (
            <div className="frogbot-connections__groups">
              {[...groups].map(([slug, items]) => (
                <ConnectionGroup
                  key={slug}
                  slug={slug}
                  piece={bySlug.get(slug)}
                  connections={items}
                  busy={pending}
                  onAction={act}
                />
              ))}
            </div>
          )}
        </>
      )}
      {slots.length > 0 && <AppConnections apiPath={apiPath} returnTo={returnTo} slots={slots} />}
      <NewConnectionDialog
        key={dialog.key}
        pieces={pieces}
        apiPath={apiPath}
        returnTo={returnTo}
        initialPiece={dialog.piece}
        initialMethod={dialog.method}
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
