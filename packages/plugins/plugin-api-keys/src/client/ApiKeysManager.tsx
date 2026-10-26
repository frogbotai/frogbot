'use client';

import './styles.css';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
  Tooltip,
} from '@frogbotai/ui';
import { useConfig, useListQuery, useRouteCache } from '@frogbotai/ui/admin';
import { CopyIcon } from '@frogbotai/ui/icons';
import { useId, useState } from 'react';

export function ApiKeysManager() {
  const { config } = useConfig();
  const { collectionSlug } = useListQuery();
  const { clearRouteCache } = useRouteCache();
  const nameId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [token, setToken] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hoveredControl, setHoveredControl] = useState<'icon' | 'token'>();

  function changeOpen(next: boolean) {
    if (next) {
      setName('');
      setToken(undefined);
      setError(undefined);
      setCopied(false);
      setHoveredControl(undefined);
    } else if (token) {
      clearRouteCache();
    }

    setOpen(next);
  }

  async function createKey() {
    if (loading || !name.trim()) return;

    setLoading(true);
    setError(undefined);

    const response = await fetch(`${config.routes.api}/${collectionSlug}/mint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });

    const result = (await response.json()) as { error?: string; token?: string };

    setLoading(false);
    if (!response.ok || !result.token) {
      setError(result.error ?? 'Unable to create API key');

      return;
    }

    setToken(result.token);
  }

  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
  }

  function copyHandlers(control: 'icon' | 'token') {
    return {
      onClick: copyToken,
      onMouseEnter: () => {
        setHoveredControl(control);
        setCopied(false);
      },
      onMouseLeave: () => {
        setHoveredControl(undefined);
        setCopied(false);
      },
    };
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" type="button">
          Create API key
        </Button>
      </DialogTrigger>
      <DialogContent className="api-keys-dialog" withCloseButton={false}>
        <DialogTitle>Create API Key</DialogTitle>
        {token ? (
          <>
            <DialogDescription className="api-keys-dialog__warning" role="alert">
              Key generated! Copy it now — you won&apos;t see it again.
            </DialogDescription>
            <div className="api-keys-dialog__token-row">
              <Tooltip
                label={copied ? 'Copied' : 'Click to copy'}
                open={hoveredControl === 'token'}
              >
                <button
                  aria-label="Click to copy API key"
                  className="api-keys-dialog__token"
                  type="button"
                  {...copyHandlers('token')}
                >
                  <code>{token}</code>
                </button>
              </Tooltip>
              <Tooltip label={copied ? 'Copied' : 'Copy'} open={hoveredControl === 'icon'}>
                <Button
                  aria-label="Copy API key"
                  size="icon"
                  type="button"
                  variant="ghost"
                  {...copyHandlers('icon')}
                >
                  <CopyIcon />
                </Button>
              </Tooltip>
            </div>
          </>
        ) : (
          <>
            <DialogDescription>
              Name the key after the script or tool that uses it.
            </DialogDescription>
            <div className="api-keys-dialog__field">
              <Label htmlFor={nameId}>Key name</Label>
              <Input
                id={nameId}
                placeholder="Key name (e.g. My MacBook CLI)"
                readOnly={loading}
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void createKey();
                  }
                }}
              />
            </div>
          </>
        )}
        {error ? (
          <p className="api-keys-dialog__error" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => changeOpen(false)} type="button">
            {token ? 'Close' : 'Dismiss'}
          </Button>
          {token ? null : (
            <Button disabled={loading || !name.trim()} onClick={createKey} type="button">
              {loading ? 'Generating…' : 'Generate'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RevokeApiKey({
  rowData,
}: {
  rowData: { id: string | number; name?: string; revokedAt?: string | null };
}) {
  const { config } = useConfig();
  const { collectionSlug } = useListQuery();
  const { clearRouteCache } = useRouteCache();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState<string>();

  function changeOpen(next: boolean) {
    if (next) setError(undefined);

    setOpen(next);
  }

  async function revoke() {
    setLoading(true);
    setError(undefined);
    const response = await fetch(`${config.routes.api}/${collectionSlug}/${rowData.id}/revoke`, {
      method: 'POST',
    });

    setLoading(false);
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setError(result.error ?? 'Unable to revoke API key');

      return;
    }

    setOpen(false);
    setRevoked(true);
    clearRouteCache();
  }

  if (revoked || rowData.revokedAt) return <span>Revoked</span>;

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button size="sm" type="button" variant="secondary">
          Revoke
        </Button>
      </DialogTrigger>
      <DialogContent className="api-keys-dialog" withCloseButton={false}>
        <DialogTitle>Revoke API Key</DialogTitle>
        <DialogDescription>
          This will immediately disable {rowData.name ?? 'this key'}. Any scripts or tools using
          this key will stop working. This cannot be undone.
        </DialogDescription>
        {error ? (
          <p className="api-keys-dialog__error" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="secondary" onClick={() => changeOpen(false)} type="button">
            Cancel
          </Button>
          <Button disabled={loading} onClick={revoke} type="button">
            {loading ? 'Revoking…' : 'Revoke key'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
