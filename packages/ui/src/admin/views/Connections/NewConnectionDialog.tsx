'use client';

import { useState } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../../../components/dialog.js';
import { SearchInput } from '../../../components/search-input.js';
import { ConnectionForm, type ConnectionMethod } from './ConnectionForm.js';
import { PieceLogo } from './PieceLogo.js';
import type { ConnectionPiece, ConnectionsViewClientProps } from './types.js';

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
