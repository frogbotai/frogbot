import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const clearRouteCache = vi.fn();
const listQuery = vi.hoisted(() => ({ value: { collectionSlug: 'api-keys' } as object }));

vi.mock('@frogbotai/ui/admin', () => ({
  Button: ({
    buttonStyle,
    children,
    onClick,
    size,
    ...props
  }: React.ComponentProps<'button'> & { buttonStyle?: string; size?: string }) => (
    <button
      {...props}
      className={`btn btn--style-${buttonStyle} btn--size-${size}`}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </button>
  ),
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
  useListQuery: () => listQuery.value,
  useRouteCache: () => ({ clearRouteCache }),
}));

const { ApiKeysManager, RevokeApiKey } =
  await import('../../../../packages/plugins/plugin-api-keys/src/client/ApiKeysManager.js');

const { useCreateKeyData } =
  await import('../../../../packages/plugins/plugin-api-keys/src/client/createKeyData.js');

function mint(token = 'frogbot_secret') {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ token }),
  } as Response);
}

function openCreate() {
  render(<ApiKeysManager />);
  fireEvent.click(screen.getByRole('button', { name: 'Create API key' }));
}

async function generate(name = 'Deploy') {
  fireEvent.change(screen.getByLabelText('Key name'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
  await screen.findByText('frogbot_secret');
}

describe('API key controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listQuery.value = { collectionSlug: 'api-keys' };
    vi.stubGlobal('fetch', vi.fn());

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn() },
    });
  });

  it('creates and reveals an API key in the dialog', async () => {
    mint();
    render(<ApiKeysManager />);

    expect(screen.queryByRole('dialog')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }));

    expect(screen.getByRole('dialog').classList).toContain('fb-dialog__content');

    await generate();

    expect(screen.getByText("Key generated! Copy it now — you won't see it again.")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      '/api/api-keys/mint',
      expect.objectContaining({
        body: JSON.stringify({ name: 'Deploy' }),
        method: 'POST',
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(clearRouteCache).toHaveBeenCalled();
  });

  it("opens from Payload's primary medium button and returns focus to it on Escape", async () => {
    const user = userEvent.setup();

    render(<ApiKeysManager />);

    const trigger = screen.getByRole('button', { name: 'Create API key' });

    expect(trigger.className).toBe('btn btn--style-primary btn--size-medium');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await user.click(trigger);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    expect(document.activeElement).toBe(trigger);
  });

  it('mints with its collectionSlug prop outside a list query', async () => {
    listQuery.value = {};
    mint();
    render(<ApiKeysManager collectionSlug="credentials" />);
    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }));

    await generate();

    expect(fetch).toHaveBeenCalledWith('/api/credentials/mint', expect.anything());
  });

  it('starts focus in the key name input', async () => {
    openCreate();

    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Key name')));
  });

  it('closes on Escape and returns focus to Create API key', async () => {
    const user = userEvent.setup();

    render(<ApiKeysManager />);
    await user.click(screen.getByRole('button', { name: 'Create API key' }));
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Create API key' }));
  });

  it('generates on Enter in the key name input', async () => {
    mint();
    openCreate();

    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Deploy' } });
    fireEvent.keyDown(screen.getByLabelText('Key name'), { key: 'Enter' });

    expect(await screen.findByText('frogbot_secret')).toBeTruthy();
  });

  it('ignores Enter when the name is empty', () => {
    openCreate();
    fireEvent.keyDown(screen.getByLabelText('Key name'), { key: 'Enter' });

    expect(fetch).not.toHaveBeenCalled();
  });

  it('copies the token with feedback', async () => {
    mint();
    openCreate();
    await generate();

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Copy API key' }));

    expect(screen.getByRole('tooltip').textContent).toBe('Copy');

    fireEvent.click(screen.getByRole('button', { name: 'Copy API key' }));
    await waitFor(() => expect(screen.getByRole('tooltip').textContent).toBe('Copied'));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('frogbot_secret');

    fireEvent.mouseLeave(screen.getByRole('button', { name: 'Copy API key' }));
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Click to copy API key' }));

    expect(screen.getByRole('tooltip').textContent).toBe('Click to copy');

    fireEvent.click(screen.getByRole('button', { name: 'Click to copy API key' }));
    await waitFor(() => expect(screen.getByRole('tooltip').textContent).toBe('Copied'));
  });

  it('does not clear the route cache when dismissed without a key', () => {
    openCreate();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(clearRouteCache).not.toHaveBeenCalled();
  });

  it('confirms before revoking an active key', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true } as Response);
    render(<RevokeApiKey rowData={{ id: 'key-1', name: 'Deploy' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(
      screen.getByText(
        'This will immediately disable Deploy. Any scripts or tools using this key will stop working. This cannot be undone.',
      ),
    ).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Revoke key' }));

    await waitFor(() => expect(screen.getByText('Revoked')).toBeTruthy());

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(clearRouteCache).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith('/api/api-keys/key-1/revoke', { method: 'POST' });
  });

  it('keeps the revoke dialog open with the error when revoking fails', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Key is in use' }),
    } as Response);

    render(<RevokeApiKey rowData={{ id: 'key-1', name: 'Deploy' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    fireEvent.click(screen.getByRole('button', { name: 'Revoke key' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Key is in use');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(clearRouteCache).not.toHaveBeenCalled();
  });

  it('cancels revocation without calling the endpoint', () => {
    render(<RevokeApiKey rowData={{ id: 'key-1', name: 'Deploy' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy();
  });

  it('shows revoked keys without an action', () => {
    render(<RevokeApiKey rowData={{ id: 'key-1', revokedAt: '2026-07-29' }} />);

    expect(screen.getByText('Revoked')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Revoke' })).toBeNull();
  });

  it('has no Limits section when no plugin registers create fields', () => {
    openCreate();

    expect(screen.queryByRole('button', { name: 'Limits' })).toBeNull();
  });

  it('posts the values registered create fields set as data', async () => {
    mint();

    function CapField() {
      const { data, setValue } = useCreateKeyData();

      return (
        <label>
          Cap
          <input
            value={typeof data.monthlyBudget === 'number' ? String(data.monthlyBudget) : ''}
            onChange={(event) => setValue('monthlyBudget', Number(event.target.value))}
          />
        </label>
      );
    }

    render(<ApiKeysManager createFields={[<CapField key="cap" />]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Create API key' }));

    expect(screen.queryByLabelText('Cap')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Limits' }));
    fireEvent.change(screen.getByLabelText('Cap'), { target: { value: '25' } });
    await generate();

    expect(fetch).toHaveBeenCalledWith(
      '/api/api-keys/mint',
      expect.objectContaining({
        body: JSON.stringify({ name: 'Deploy', data: { monthlyBudget: 25 } }),
      }),
    );
  });

  it('shows a mint validation error in the dialog', async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: "Can't exceed Ada's monthly budget of $50.00." }),
    } as Response);

    openCreate();

    fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Deploy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      "Can't exceed Ada's monthly budget of $50.00.",
    );
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('the client entry exports the key controls and the create data hook', async () => {
    const entry = await import('../../../../packages/plugins/plugin-api-keys/src/client.js');

    expect(Object.keys(entry).sort()).toEqual([
      'ApiKeysManager',
      'RevokeApiKey',
      'useCreateKeyData',
    ]);
  });
});
