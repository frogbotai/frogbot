import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

  describe('expiry', () => {
    const zone = process.env.TZ;

    afterEach(() => {
      vi.useRealTimers();
      if (zone === undefined) delete process.env.TZ;
      else process.env.TZ = zone;
    });

    const day = () => screen.getByLabelText<HTMLInputElement>('Expires');
    const posted = () => JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);

    it('starts empty, no earlier than today, and mints with no expiresAt', async () => {
      vi.useFakeTimers({ now: new Date(2026, 10, 8, 9, 0), toFake: ['Date'] });
      mint();
      openCreate();

      expect(day().value).toBe('');
      expect(day().type).toBe('date');
      expect(day().min).toBe('2026-11-08');
      expect(day().max).toBe('9999-12-30');

      await generate();

      expect(posted()).toEqual({ name: 'Deploy' });
    });

    it.each([
      ['30 days', '2026-12-08', new Date(2026, 11, 9)],
      ['90 days', '2027-02-06', new Date(2027, 1, 7)],
      ['1 year', '2027-11-08', new Date(2027, 10, 9)],
    ])('fills %s from today and mints through the end of that day', async (label, filled, next) => {
      vi.useFakeTimers({ now: new Date(2026, 10, 8, 9, 0), toFake: ['Date'] });
      mint();
      openCreate();

      fireEvent.click(screen.getByRole('button', { name: label }));

      expect(day().value).toBe(filled);

      await generate();

      expect(posted()).toEqual({ name: 'Deploy', expiresAt: next.toISOString() });
    });

    it('fills "1 year" from Feb 29 with Feb 28 of next year, not Mar 1', () => {
      vi.useFakeTimers({ now: new Date(2028, 1, 29, 9, 0), toFake: ['Date'] });
      openCreate();

      fireEvent.click(screen.getByRole('button', { name: '1 year' }));

      expect(day().value).toBe('2029-02-28');
    });

    it.each([
      ['late in the evening west of UTC', 'America/Los_Angeles', 23, '2026-12-09T08:00:00.000Z'],
      ['just after midnight east of UTC', 'Asia/Tokyo', 0, '2026-12-08T15:00:00.000Z'],
    ])('keeps the day from slipping %s', async (_name, timeZone, hour, expiresAt) => {
      process.env.TZ = timeZone;
      vi.useFakeTimers({ now: new Date(2026, 10, 8, hour, 30), toFake: ['Date'] });
      mint();
      openCreate();

      fireEvent.click(screen.getByRole('button', { name: '30 days' }));

      expect(day().min).toBe('2026-11-08');
      expect(day().value).toBe('2026-12-08');

      await generate();

      expect(posted().expiresAt).toBe(expiresAt);
    });

    it('clears the day with No expiry, and takes a typed day after a quick button', async () => {
      mint();
      openCreate();

      fireEvent.click(screen.getByRole('button', { name: '90 days' }));
      fireEvent.click(screen.getByRole('button', { name: 'No expiry' }));

      expect(day().value).toBe('');

      fireEvent.click(screen.getByRole('button', { name: '1 year' }));
      fireEvent.change(day(), { target: { value: '2030-03-01' } });
      await generate();

      expect(posted().expiresAt).toBe(new Date(2030, 2, 2).toISOString());
    });

    it("shows the server's refusal in the dialog", async () => {
      vi.mocked(fetch).mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({ error: 'expiresAt must be in the future.' }),
      } as Response);

      openCreate();

      fireEvent.change(screen.getByLabelText('Key name'), { target: { value: 'Deploy' } });
      fireEvent.change(day(), { target: { value: '2020-01-01' } });
      fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

      expect((await screen.findByRole('alert')).textContent).toBe(
        'expiresAt must be in the future.',
      );
    });

    it('empties the day when the dialog opens again', () => {
      openCreate();
      fireEvent.click(screen.getByRole('button', { name: '30 days' }));
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
      fireEvent.click(screen.getByRole('button', { name: 'Create API key' }));

      expect(day().value).toBe('');
    });
  });

  it('does not clear the route cache when dismissed without a key', () => {
    openCreate();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(clearRouteCache).not.toHaveBeenCalled();
  });

  function keysMade(count: number | null, revoke: Partial<Response> = { ok: true }) {
    vi.mocked(fetch).mockImplementation((input) =>
      Promise.resolve(
        String(input).endsWith('/revoke')
          ? (revoke as Response)
          : ({
              ok: count !== null,
              json: () => Promise.resolve(count === null ? {} : { count }),
            } as Response),
      ),
    );
  }

  async function clickRevokeKey() {
    const button = screen.getByRole('button', { name: 'Revoke key' });

    await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(button);
  }

  const revokeCalls = () =>
    vi.mocked(fetch).mock.calls.filter(([input]) => String(input).endsWith('/revoke'));

  it('confirms before revoking an active key, with no body when it made no keys', async () => {
    keysMade(0);
    render(<RevokeApiKey rowData={{ id: 'key-1', name: 'Deploy' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(
      screen.getByText(
        'This will immediately disable Deploy. Any scripts or tools using this key will stop working. This cannot be undone.',
      ),
    ).toBeTruthy();
    expect(revokeCalls()).toEqual([]);
    expect(fetch).toHaveBeenCalledWith('/api/api-keys/key-1/minted-count');

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    expect(screen.queryByRole('checkbox')).toBeNull();

    await clickRevokeKey();

    await waitFor(() => expect(screen.getByText('Revoked')).toBeTruthy());

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(clearRouteCache).toHaveBeenCalled();
    expect(revokeCalls()).toEqual([['/api/api-keys/key-1/revoke', { method: 'POST' }]]);
  });

  it('offers to revoke the keys it made, checked by default', async () => {
    keysMade(2);
    render(<RevokeApiKey rowData={{ id: 'key-1', name: 'Deploy' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    const checkbox = await screen.findByRole('checkbox', {
      name: 'Also revoke the 2 keys it made',
    });

    expect(checkbox.getAttribute('aria-checked')).toBe('true');

    await clickRevokeKey();

    await waitFor(() => expect(screen.getByText('Revoked')).toBeTruthy());

    expect(revokeCalls()).toEqual([
      [
        '/api/api-keys/key-1/revoke',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ cascade: true }),
        },
      ],
    ]);
  });

  it('keeps the keys it made when the box is cleared', async () => {
    keysMade(1);
    render(<RevokeApiKey rowData={{ id: 'key-1', name: 'Deploy' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Also revoke the key it made' }));
    await clickRevokeKey();

    await waitFor(() => expect(screen.getByText('Revoked')).toBeTruthy());

    expect(revokeCalls()[0]?.[1]).toMatchObject({ body: JSON.stringify({ cascade: false }) });
  });

  it('still offers the box, checked, when the count fails', async () => {
    keysMade(null);
    render(<RevokeApiKey rowData={{ id: 'key-1', name: 'Deploy' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    const checkbox = await screen.findByRole('checkbox', { name: 'Also revoke the keys it made' });

    expect(checkbox.getAttribute('aria-checked')).toBe('true');
  });

  it('keeps the revoke dialog open with the error when revoking fails', async () => {
    keysMade(0, { ok: false, json: () => Promise.resolve({ error: 'Key is in use' }) });

    render(<RevokeApiKey rowData={{ id: 'key-1', name: 'Deploy' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    await clickRevokeKey();

    expect((await screen.findByRole('alert')).textContent).toBe('Key is in use');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(clearRouteCache).not.toHaveBeenCalled();
  });

  it('cancels revocation without calling the revoke endpoint', async () => {
    keysMade(0);
    render(<RevokeApiKey rowData={{ id: 'key-1', name: 'Deploy' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByRole('dialog')).toBeNull();

    await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

    expect(revokeCalls()).toEqual([]);
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy();
  });

  it('waits for the count before Revoke key works', async () => {
    let answer: (response: Response) => void = () => undefined;

    vi.mocked(fetch).mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        answer = resolve;
      }),
    );

    render(<RevokeApiKey rowData={{ id: 'key-1', name: 'Deploy' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    const button = screen.getByRole('button', { name: 'Revoke key' }) as HTMLButtonElement;

    expect(button.disabled).toBe(true);

    fireEvent.click(button);

    expect(revokeCalls()).toEqual([]);

    answer({ ok: true, json: () => Promise.resolve({ count: 1 }) } as Response);

    expect(
      (await screen.findByRole('checkbox', { name: 'Also revoke the key it made' })).getAttribute(
        'aria-checked',
      ),
    ).toBe('true');

    await waitFor(() => expect(button.disabled).toBe(false));
  });

  it('offers the box when the only live key it made sits under a key revoked on its own', async () => {
    type Key = { id: string; mintedBy: string | null; revokedAt: string | null };
    const keys: Key[] = [
      { id: 'P', mintedBy: null, revokedAt: null },
      { id: 'K', mintedBy: 'P', revokedAt: '2026-11-01T00:00:00.000Z' },
      { id: 'C', mintedBy: 'K', revokedAt: null },
    ];

    const below = (id: string): Key[] =>
      keys.filter((key) => key.mintedBy === id).flatMap((key) => [key, ...below(key.id)]);

    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = String(input);
      const answer = (body: unknown) =>
        Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);

      if (url.endsWith('/P/revoke')) {
        const body: { cascade?: boolean } = init?.body
          ? (JSON.parse(String(init.body)) as { cascade: boolean })
          : {};

        const now = new Date().toISOString();

        keys[0].revokedAt = now;
        if (body.cascade !== false) below('P').forEach((key) => (key.revokedAt ??= now));

        return answer({});
      }

      if (url.endsWith('/P/minted-count')) {
        return answer({ count: below('P').filter((key) => !key.revokedAt).length });
      }

      return answer({
        totalDocs: keys.filter((key) => key.mintedBy === 'P' && !key.revokedAt).length,
      });
    });

    render(<RevokeApiKey rowData={{ id: 'P', name: 'Parent' }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

    const checkbox = await screen.findByRole('checkbox', { name: 'Also revoke the key it made' });

    fireEvent.click(checkbox);
    await clickRevokeKey();

    await waitFor(() => expect(keys[0].revokedAt).not.toBeNull());

    expect(keys[2].revokedAt).toBeNull();
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
