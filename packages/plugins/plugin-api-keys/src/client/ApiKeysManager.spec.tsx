import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const closeModal = vi.fn();
const openModal = vi.fn();
const clearRouteCache = vi.fn();

vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => <button {...props}>{children}</button>,
  CopyIcon: () => <svg data-testid="copy-icon" />,
  Modal: ({ children, className }: { children: ReactNode; className?: string }) => <div className={className} role="dialog">{children}</div>,
  TextInput: ({ label, ...props }: { label: string }) => <input aria-label={label} {...props} />,
  Tooltip: ({ children, show }: { children: ReactNode; show?: boolean }) => (show ? <span>{children}</span> : null),
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
  useListQuery: () => ({ collectionSlug: 'api-keys' }),
  useModal: () => ({ closeModal, openModal }),
  useRouteCache: () => ({ clearRouteCache }),
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

    expect(screen.getByRole('dialog').className).toBe('api-keys-modal');
    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }));
    expect(openModal).toHaveBeenCalledWith('create-api-key-modal');
    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Deploy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByText("Key generated! Copy it now — you won't see it again.")).toBeTruthy();
    expect(screen.getByText('frogbot_secret')).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith('/api/api-keys/mint', expect.objectContaining({
      body: JSON.stringify({ name: 'Deploy' }),
      method: 'POST',
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(closeModal).toHaveBeenCalledWith('create-api-key-modal');
    expect(clearRouteCache).toHaveBeenCalled();
  });

  it('generates on Enter in the key name input', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'frogbot_secret' }),
    } as Response);
    render(<ApiKeysManager />);

    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Deploy' } });
    fireEvent.keyDown(screen.getByLabelText('Key name'), { key: 'Enter' });

    expect(await screen.findByText('frogbot_secret')).toBeTruthy();
  });

  it('ignores Enter when the name is empty', () => {
    render(<ApiKeysManager />);
    fireEvent.keyDown(screen.getByLabelText('Key name'), { key: 'Enter' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('copies the token with feedback', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ token: 'frogbot_secret' }),
    } as Response);
    render(<ApiKeysManager />);

    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Deploy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    await screen.findByText('frogbot_secret');

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Copy API key' }));
    fireEvent.click(screen.getByRole('button', { name: 'Copy API key' }));
    await waitFor(() => expect(screen.getByText('Copied')).toBeTruthy());
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('frogbot_secret');
    expect(screen.getByTestId('copy-icon')).toBeTruthy();
  });

  it('does not clear the route cache when dismissed without a key', () => {
    render(<ApiKeysManager />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(closeModal).toHaveBeenCalledWith('create-api-key-modal');
    expect(clearRouteCache).not.toHaveBeenCalled();
  });

  it('confirms before revoking an active key', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    render(<RevokeApiKey rowData={{ id: 'key-1', name: 'Deploy' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(openModal).toHaveBeenCalledWith('revoke-api-key-modal-key-1');
    expect(
      screen.getByText(
        'This will immediately disable Deploy. Any scripts or tools using this key will stop working. This cannot be undone.',
      ),
    ).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke key' }));

    await waitFor(() => expect(screen.getByText('Revoked')).toBeTruthy());
    expect(closeModal).toHaveBeenCalledWith('revoke-api-key-modal-key-1');
    expect(clearRouteCache).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('/api/api-keys/key-1/revoke', { method: 'POST' });
  });

  it('cancels revocation without calling the endpoint', () => {
    render(<RevokeApiKey rowData={{ id: 'key-1', name: 'Deploy' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(closeModal).toHaveBeenCalledWith('revoke-api-key-modal-key-1');
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy();
  });

  it('shows revoked keys without an action', () => {
    render(<RevokeApiKey rowData={{ id: 'key-1', revokedAt: '2026-07-29' }} />);
    expect(screen.getByText('Revoked')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  });
});
