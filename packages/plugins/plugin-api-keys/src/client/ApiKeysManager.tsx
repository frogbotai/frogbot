'use client';

import { Button, CopyIcon, Modal, TextInput, Tooltip, useConfig, useListQuery, useModal, useRouteCache } from '@payloadcms/ui';
import { type ChangeEvent, type KeyboardEvent, useState } from 'react';

import './styles.css';

const modalSlug = 'create-api-key-modal';

export function ApiKeysManager() {
  const { config } = useConfig();
  const { collectionSlug } = useListQuery();
  const { closeModal, openModal } = useModal();
  const { clearRouteCache } = useRouteCache();
  const [name, setName] = useState('');
  const [token, setToken] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hoveredControl, setHoveredControl] = useState<'icon' | 'token'>();

  function open() {
    setName('');
    setToken(undefined);
    setError(undefined);
    setCopied(false);
    openModal(modalSlug);
  }

  function close() {
    closeModal(modalSlug);
    if (token) clearRouteCache();
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
    <>
      <Button buttonStyle="secondary" margin={false} onClick={open} type="button">
        Create API key
      </Button>
      <Modal className="api-keys-modal" closeOnBlur onClose={close} slug={modalSlug}>
        <div className="api-keys-modal__wrapper">
          <div className="api-keys-modal__content">
            <h1>Create API Key</h1>
            {token ? (
              <>
                <p className="api-keys-modal__warning" role="alert">
                  Key generated! Copy it now — you won&apos;t see it again.
                </p>
                <div className="api-keys-modal__token-row">
                  <button
                    aria-label="Click to copy API key"
                    className="api-keys-clear-button api-keys-modal__token"
                    type="button"
                    {...copyHandlers('token')}
                  >
                    <code>{token}</code>
                    <Tooltip delay={copied ? 0 : undefined} show={hoveredControl === 'token'}>
                      {copied ? 'Copied' : 'Click to copy'}
                    </Tooltip>
                  </button>
                  <button
                    aria-label="Copy API key"
                    className="api-keys-clear-button api-keys-slide-up-1 api-keys-modal__copy"
                    type="button"
                    {...copyHandlers('icon')}
                  >
                    <CopyIcon />
                    <Tooltip delay={copied ? 0 : undefined} show={hoveredControl === 'icon'}>
                      {copied ? 'Copied' : 'Copy'}
                    </Tooltip>
                  </button>
                </div>
              </>
            ) : (
              <TextInput
                label="Key name"
                path="api-key-name"
                placeholder="Key name (e.g. My MacBook CLI)"
                readOnly={loading}
                value={name}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
                onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void createKey();
                  }
                }}
              />
            )}
            {error ? <p role="alert">{error}</p> : null}
          </div>
          <div className="api-keys-modal__controls">
            <Button buttonStyle="secondary" onClick={close} type="button">
              {token ? 'Close' : 'Dismiss'}
            </Button>
            {token ? null : (
              <Button disabled={loading || !name.trim()} onClick={createKey} type="button">
                {loading ? 'Generating…' : 'Generate'}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

export function RevokeApiKey({
  rowData,
}: {
  rowData: { id: string | number; name?: string; revokedAt?: string | null };
}) {
  const { config } = useConfig();
  const { collectionSlug } = useListQuery();
  const { closeModal, openModal } = useModal();
  const { clearRouteCache } = useRouteCache();
  const [loading, setLoading] = useState(false);
  const [revoked, setRevoked] = useState(false);
  const [error, setError] = useState<string>();
  const confirmSlug = `revoke-api-key-modal-${rowData.id}`;

  async function revoke() {
    setLoading(true);
    setError(undefined);
    const response = await fetch(`${config.routes.api}/${collectionSlug}/${rowData.id}/revoke`, { method: 'POST' });
    setLoading(false);
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setError(result.error ?? 'Unable to revoke API key');
      return;
    }
    closeModal(confirmSlug);
    setRevoked(true);
    clearRouteCache();
  }

  if (revoked || rowData.revokedAt) return <span>Revoked</span>;

  return (
    <>
      <Button
        margin={false}
        buttonStyle="secondary"
        onClick={() => openModal(confirmSlug)}
        size="small"
        type="button"
      >
        Revoke
      </Button>
      <Modal className="api-keys-modal" closeOnBlur onClose={() => closeModal(confirmSlug)} slug={confirmSlug}>
        <div className="api-keys-modal__wrapper">
          <div className="api-keys-modal__content">
            <h1>Revoke API Key</h1>
            <p>
              This will immediately disable {rowData.name ?? 'this key'}. Any scripts or tools using this key will stop
              working. This cannot be undone.
            </p>
            {error ? <p role="alert">{error}</p> : null}
          </div>
          <div className="api-keys-modal__controls">
            <Button buttonStyle="secondary" onClick={() => closeModal(confirmSlug)} type="button">
              Cancel
            </Button>
            <Button disabled={loading} onClick={revoke} type="button">
              {loading ? 'Revoking…' : 'Revoke key'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
