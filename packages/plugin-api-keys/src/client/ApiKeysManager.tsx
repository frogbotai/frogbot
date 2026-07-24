'use client';

import { Button, TextInput, useConfig, useListQuery } from '@payloadcms/ui';
import { useState } from 'react';

type ApiKeyDoc = {
  id: string | number;
  name?: string;
  prefix?: string;
  revokedAt?: string | null;
};

export function ApiKeysManager() {
  const { config } = useConfig();
  const { collectionSlug, data, query, refineListData } = useListQuery();
  const [name, setName] = useState('');
  const [token, setToken] = useState<string>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const api = config.routes.api;

  async function refresh() {
    await refineListData(query);
  }

  async function createKey() {
    setLoading(true);
    setError(undefined);
    const response = await fetch(`${api}/${collectionSlug}/mint`, {
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
    setName('');
    setToken(result.token);
    await refresh();
  }

  async function revokeKey(id: string | number) {
    setLoading(true);
    setError(undefined);
    const response = await fetch(`${api}/${collectionSlug}/${id}/revoke`, { method: 'POST' });
    setLoading(false);
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      setError(result.error ?? 'Unable to revoke API key');
      return;
    }
    await refresh();
  }

  async function copyToken() {
    if (token) await navigator.clipboard.writeText(token);
  }

  const docs = (data?.docs ?? []) as ApiKeyDoc[];
  return (
    <div>
      <TextInput
        label="Key name"
        path="api-key-name"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Button disabled={loading || !name.trim()} onClick={createKey} type="button">
        Create API key
      </Button>
      {token ? (
        <div>
          <p>This key is shown once. Copy it now.</p>
          <TextInput label="API key" path="new-api-key" readOnly value={token} />
          <Button onClick={copyToken} type="button">
            Copy API key
          </Button>
          <Button onClick={() => setToken(undefined)} type="button">
            Dismiss
          </Button>
        </div>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {docs
        .filter((doc) => !doc.revokedAt)
        .map((doc) => (
          <Button disabled={loading} key={doc.id} onClick={() => revokeKey(doc.id)} type="button">
            Revoke {doc.name ?? doc.prefix ?? String(doc.id)}
          </Button>
        ))}
    </div>
  );
}
