import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@frogbotai/ui/admin', () => ({
  toast: { success: vi.fn() },
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
  useRouteCache: () => ({ clearRouteCache: vi.fn() }),
}));

vi.mock('../../../packages/plugins/plugin-two-factor/src/client/dialogs.js', () => ({
  CodeDialog: () => null,
  EnableDialog: () => null,
  ResetDialog: () => null,
}));

const { TwoFactorField } =
  await import('../../../packages/plugins/plugin-two-factor/src/client/TwoFactorField.js');

type Props = Parameters<typeof TwoFactorField>[0];

const field = (props: Partial<Props> = {}) =>
  render(
    <TwoFactorField
      canEnable
      canReset={false}
      collectionSlug="users"
      enabled={false}
      name="ada@example.com"
      required={false}
      self
      signIn={{ password: true, provider: false }}
      userId="1"
      {...props}
    />,
  );

describe('TwoFactorField', () => {
  it.each([
    [{ password: true, provider: true }, 'after your password or sign-in provider.'],
    [{ password: true, provider: false }, 'after your password.'],
    [{ password: false, provider: true }, 'after your sign-in provider.'],
  ])('names only the sign-in methods the collection has: %o', (signIn, ending) => {
    const { unmount } = field({ signIn });

    expect(screen.getByText(`Ask for a code from an authenticator app ${ending}`)).toBeTruthy();

    unmount();

    field({ signIn, enabled: true });

    expect(
      screen.getByText(`Signing in asks for a code from your authenticator app ${ending}`),
    ).toBeTruthy();
  });

  it('drops the method when the collection has neither', () => {
    field({ signIn: { password: false, provider: false } });

    expect(screen.getByText('Ask for a code from an authenticator app.')).toBeTruthy();
  });

  it('links API keys to keysURL when it is set', () => {
    field({ keysURL: '/admin/collections/api-keys' });

    expect(screen.getByRole('link', { name: 'API keys' }).getAttribute('href')).toBe(
      '/admin/collections/api-keys',
    );
  });

  it('leaves API keys unlinked without keysURL', () => {
    field();

    expect(screen.queryByRole('link')).toBeNull();
    expect(
      screen.getByText("API keys aren't affected: they keep working without a code."),
    ).toBeTruthy();
  });
});
