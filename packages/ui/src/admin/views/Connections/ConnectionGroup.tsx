'use client';

import { Badge } from '../../../components/badge.js';
import { Button } from '../../../components/button.js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/dropdown-menu.js';
import DeleteIcon from '../../../icons/icons/DeleteIcon.js';
import LoadingIcon from '../../../icons/icons/LoadingIcon.js';
import MoreHorizontalIcon from '../../../icons/icons/MoreHorizontalIcon.js';
import RefreshIcon from '../../../icons/icons/RefreshIcon.js';
import StarIcon from '../../../icons/icons/StarIcon.js';
import { PieceLogo } from './PieceLogo.js';
import { connectionStatus } from './status.js';
import type { ConnectionItem, ConnectionPiece } from './types.js';

export type ConnectionAction = 'default' | 'reconnect' | 'disconnect';

function ConnectionRow({
  connection,
  label,
  piece,
  showDefault,
  busy,
  onAction,
}: {
  connection: ConnectionItem;
  label: string;
  piece?: ConnectionPiece;
  showDefault: boolean;
  busy: boolean;
  onAction: (action: ConnectionAction) => void;
}) {
  const status = connectionStatus(connection, piece?.scopes);
  const name = connection.account?.label || connection.account?.email || label;
  const method =
    connection.method === 'oauth' ? (piece?.oauthLabel ?? 'OAuth') : 'Static credentials';

  const email =
    connection.account?.email && connection.account.email !== connection.account.label
      ? connection.account.email
      : undefined;

  return (
    <div className="frogbot-connections__row">
      <div className="frogbot-connections__identity">
        <div>
          <strong>{name}</strong>
          {email && <span className="frogbot-connections__muted">{email}</span>}
        </div>
      </div>
      <div className="frogbot-connections__row-actions">
        {showDefault && connection.isDefault && <Badge variant="accent">Default</Badge>}
        <span className={`frogbot-connections__status frogbot-connections__status--${status}`}>
          {status === 'relink' ? 'needs re-link' : status}
        </span>
        <span className="frogbot-connections__muted">{method}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="frogbot-connections__menu"
              disabled={busy}
              aria-label={`Options for ${name}`}
            >
              {busy ? (
                <LoadingIcon className="frogbot-connections__spinner" size={16} />
              ) : (
                <MoreHorizontalIcon size={16} />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {!connection.isDefault && (
              <DropdownMenuItem onSelect={() => onAction('default')}>
                <StarIcon size={16} />
                Set as default
              </DropdownMenuItem>
            )}
            {piece && (
              <DropdownMenuItem onSelect={() => onAction('reconnect')}>
                <RefreshIcon size={16} />
                Reconnect
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="frogbot-connections__disconnect"
              onSelect={() => onAction('disconnect')}
            >
              <DeleteIcon size={16} />
              Disconnect
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/**
 * One piece's linked accounts: a header with Add another (OAuth pieces only, since an API key
 * stays one per piece, and only once for a recipe that can't tell provider accounts apart), then
 * a row per account with Set as default, Reconnect and Disconnect.
 */
export function ConnectionGroup({
  slug,
  piece,
  connections,
  busy,
  onAdd,
  onAction,
}: {
  slug: string;
  piece?: ConnectionPiece;
  connections: ConnectionItem[];
  busy?: number | string;
  onAdd: () => void;
  onAction: (connection: ConnectionItem, action: ConnectionAction) => void;
}) {
  const label = piece?.label ?? slug;

  return (
    <section className="frogbot-connections__group" aria-label={label}>
      <header className="frogbot-connections__group-header">
        <PieceLogo src={piece?.icon} />
        <div className="frogbot-connections__group-title">
          <strong>{label}</strong>
          <span className="frogbot-connections__muted">
            {connections.length === 1 ? '1 account' : `${connections.length} accounts`}
          </span>
        </div>
        {piece?.oauth &&
          (piece.oauthAccounts !== false ||
            !connections.some(({ method }) => method === 'oauth')) && (
            <Button
              variant="outline"
              size="sm"
              className="frogbot-connections__lift"
              onClick={onAdd}
            >
              + Add another
            </Button>
          )}
      </header>
      <div className="frogbot-connections__rows">
        {connections.map((connection) => (
          <ConnectionRow
            key={connection.id}
            connection={connection}
            label={label}
            piece={piece}
            showDefault={connections.length > 1}
            busy={busy === connection.id}
            onAction={(action) => onAction(connection, action)}
          />
        ))}
      </div>
    </section>
  );
}
