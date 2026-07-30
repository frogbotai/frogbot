import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const closeModal = vi.fn();
const openModal = vi.fn();
const refineListData = vi.fn();

vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
  Modal: ({ children }: { children: ReactNode }) => <div role="dialog">{children}</div>,
  TextInput: ({ label, ...props }: { label: string }) => <input aria-label={label} {...props} />,
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
  useListQuery: () => ({ collectionSlug: 'api-keys', query: { page: 1 }, refineListData }),
  useModal: () => ({ closeModal, openModal }),
}));

const { ApiKeysManager, RevokeApiKey } = await import('./ApiKeysManager.js');

describe('API key controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
    Object.assign(navigator, { clipboard: { writeText: vi.fn() } });
  });

  it('creates and reveals an API key in the modal', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'frogbot_secret' }),
    } as Response);
    render(<ApiKeysManager />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Create API key' })[0]!);
    expect(openModal).toHaveBeenCalledWith('create-api-key-modal');
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Deploy' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Create API key' })[1]!);

    expect(await screen.findByText('This key is shown once. Copy it now.')).toBeTruthy();
    expect((screen.getByLabelText('API key') as HTMLInputElement).value).toBe('frogbot_secret');
    expect(fetch).toHaveBeenCalledWith('/api/api-keys/mint', expect.objectContaining({
      body: JSON.stringify({ name: 'Deploy' }),
      method: 'POST',
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(closeModal).toHaveBeenCalledWith('create-api-key-modal');
    expect(refineListData).toHaveBeenCalledWith({ page: 1 });
  });

  it('revokes an active key from its row', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    render(<RevokeApiKey rowData={{ id: 'key-1' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(refineListData).toHaveBeenCalledWith({ page: 1 }));
    expect(fetch).toHaveBeenCalledWith('/api/api-keys/key-1/revoke', { method: 'POST' });
  });

  it('shows revoked keys without an action', () => {
    render(<RevokeApiKey rowData={{ id: 'key-1', revokedAt: '2026-07-29' }} />);
    expect(screen.getByText('Revoked')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  });
});
