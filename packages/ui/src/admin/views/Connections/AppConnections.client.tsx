'use client';

import { useRef, useState } from 'react';

import { Button } from '../../../components/button.js';
import { Dialog, DialogContent } from '../../../components/dialog.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/dropdown-menu.js';
import DeleteIcon from '../../../icons/icons/DeleteIcon.js';
import LinkSquareIcon from '../../../icons/icons/LinkSquareIcon.js';
import LoadingIcon from '../../../icons/icons/LoadingIcon.js';
import MoreHorizontalIcon from '../../../icons/icons/MoreHorizontalIcon.js';
import { ConnectionForm } from './ConnectionForm.js';
import { PieceLogo } from './PieceLogo.js';
import { connectionStatus } from './status.js';
import type { ConnectionSlot } from './types.js';

const slotKey = ({ app, piece }: ConnectionSlot) => `${app}/${piece.slug}`;

function SlotRow({
  slot,
  busy,
  onLink,
  onDisconnect,
}: {
  slot: ConnectionSlot;
  busy: boolean;
  onLink: () => void;
  onDisconnect: () => void;
}) {
  const { app, piece, connection } = slot;
  const status = connection ? connectionStatus(connection, piece.scopes) : undefined;
  const account = connection?.account;

  return (
    <div className="frogbot-connections__row">
      <div className="frogbot-connections__identity">
        <PieceLogo src={piece.icon} />
        <div>
          <strong>{account?.label || account?.email || piece.label}</strong>
          <span className="frogbot-connections__muted">
            {app} · {piece.label}
            {account?.email && account.email !== account.label ? ` · ${account.email}` : ''}
          </span>
        </div>
      </div>
      <div className="frogbot-connections__row-actions">
        {connection && status ? (
          <>
            <span className={`frogbot-connections__status frogbot-connections__status--${status}`}>
              {status === 'relink' ? 'needs re-link' : status}
            </span>
            <span className="frogbot-connections__muted">
              {connection.method === 'oauth' ? (piece.oauthLabel ?? 'OAuth') : 'Static credentials'}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="frogbot-connections__menu"
                  disabled={busy}
                  aria-label={`Options for ${app}`}
                >
                  {busy ? (
                    <LoadingIcon className="frogbot-connections__spinner" size={16} />
                  ) : (
                    <MoreHorizontalIcon size={16} />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={onLink}>
                  <LinkSquareIcon size={16} />
                  Reconnect
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="frogbot-connections__disconnect"
                  onSelect={onDisconnect}
                >
                  <DeleteIcon size={16} />
                  Disconnect
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : (
          <>
            <span className="frogbot-connections__status frogbot-connections__status--missing">
              not linked
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              aria-label={`Link ${app}`}
              onClick={onLink}
            >
              Link
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Settings → Linked accounts' App section: the shared accounts the config declares with `app`.
 * Any admin-collection user links, reconnects and disconnects them.
 */
export function AppConnections({
  apiPath,
  returnTo,
  slots: initialSlots,
}: {
  apiPath: string;
  returnTo: string;
  slots: ConnectionSlot[];
}) {
  const [slots, setSlots] = useState(initialSlots);
  const [linking, setLinking] = useState<ConnectionSlot>();
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<string>();
  const [error, setError] = useState('');
  const removing = useRef(false);
  const slotPath = (app: string) => `${apiPath}/app/${encodeURIComponent(app)}`;

  const replace = (target: ConnectionSlot, connection: ConnectionSlot['connection']) =>
    setSlots((current) =>
      current.map((slot) => (slotKey(slot) === slotKey(target) ? { ...slot, connection } : slot)),
    );

  const disconnect = async (slot: ConnectionSlot) => {
    if (removing.current) return;
    removing.current = true;
    setDeleting(slotKey(slot));
    setError('');
    try {
      const response = await fetch(`${slotPath(slot.app)}/${encodeURIComponent(slot.piece.slug)}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });

      if (!response.ok && response.status !== 404) throw new Error();
      replace(slot, undefined);
    } catch {
      setError('Could not disconnect this account. Please try again.');
    } finally {
      removing.current = false;
      setDeleting(undefined);
    }
  };

  return (
    <section className="frogbot-connections__section" aria-labelledby="frogbot-connections-app">
      <div className="frogbot-connections__section-heading">
        <h2 id="frogbot-connections-app">App accounts</h2>
        <p className="frogbot-connections__muted">
          Shared accounts the app uses for everyone. Any admin can link or change them.
        </p>
      </div>
      {error && (
        <div className="frogbot-connections__error" role="alert">
          <span>{error}</span>
        </div>
      )}
      <div className="frogbot-connections__rows">
        {slots.map((slot) => (
          <SlotRow
            key={slotKey(slot)}
            slot={slot}
            busy={deleting === slotKey(slot)}
            onLink={() => setLinking(slot)}
            onDisconnect={() => void disconnect(slot)}
          />
        ))}
      </div>
      <Dialog
        open={!!linking}
        onOpenChange={(open) => {
          if (!open && !busy) setLinking(undefined);
        }}
      >
        <DialogContent
          className="frogbot-connections__dialog frogbot-connections__dialog--selected"
          onInteractOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
          withCloseButton={!busy}
        >
          {linking && (
            <ConnectionForm
              key={slotKey(linking)}
              piece={linking.piece}
              apiPath={slotPath(linking.app)}
              returnTo={returnTo}
              title={`Link ${linking.app} to ${linking.piece.label}`}
              onCancel={() => setLinking(undefined)}
              onBusyChange={setBusy}
              onCreated={(connection) => {
                replace(linking, connection);
                setLinking(undefined);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
