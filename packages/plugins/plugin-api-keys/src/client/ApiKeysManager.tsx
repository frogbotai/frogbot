'use client';

import { Button, Modal, TextInput, useConfig, useListQuery, useModal } from '@payloadcms/ui';
import { type ChangeEvent, useState } from 'react';

const modalSlug = 'create-api-key-modal';

export function ApiKeysManager() {
  const { config } = useConfig();
  const { collectionSlug, query, refineListData } = useListQuery();
  const { closeModal, openModal } = useModal();
  const [name, setName] = useState('');
  const [token, setToken] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);

  function close() {
    closeModal(modalSlug);
    setName('');
    setToken(undefined);
    setError(undefined);
    void refineListData(query);
  }

  async function createKey() {
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
    if (token) await navigator.clipboard.writeText(token);
  }

  return (
    <>
      <Button buttonStyle="secondary" onClick={() => openModal(modalSlug)} type="button">
        Create API key
      </Button>
      <Modal closeOnBlur onClose={close} slug={modalSlug}>
        <div className="confirmation-modal__wrapper">
          <div className="confirmation-modal__content">
            <h1>Create API Key</h1>
            {token ? (
              <>
                <p>This key is shown once. Copy it now.</p>
                <TextInput label="API key" path="new-api-key" readOnly value={token} />
              </>
            ) : (
              <TextInput
                label="Key name"
                path="api-key-name"
                value={name}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setName(event.target.value)}
              />
            )}
            {error ? <p role="alert">{error}</p> : null}
          </div>
          <div className="confirmation-modal__controls">
            {token ? (
              <Button onClick={copyToken} type="button">
                Copy API key
              </Button>
            ) : (
              <Button disabled={loading || !name.trim()} onClick={createKey} type="button">
                Create API key
              </Button>
            )}
            <Button buttonStyle="secondary" onClick={close} type="button">
              Dismiss
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

export function RevokeApiKey({ rowData }: { rowData: { id: string | number; revokedAt?: string | null } }) {
  const { config } = useConfig();
  const { collectionSlug, query, refineListData } = useListQuery();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

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
    await refineListData(query);
  }

  if (rowData.revokedAt) return <span>Revoked</span>;

  return (
    <>
      <Button buttonStyle="secondary" disabled={loading} onClick={revoke} size="small" type="button">
        Revoke
      </Button>
      {error ? <span role="alert">{error}</span> : null}
    </>
  );
}
