import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { SignInButtonsClient } from '../../../../packages/next/src/elements/SignInButtons/index.client.js';
import { SignInButtons } from '../../../../packages/next/src/elements/SignInButtons/index.js';

vi.mock('@payloadcms/ui', () => ({
  Button: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

const methods = [{ slug: 'work', piece: 'google', label: 'Google' }];
const props = (disableLocalStrategy = false) => ({
  payload: {
    config: {
      admin: { user: 'staff' },
      routes: { api: '/rest/v1', admin: '/control' },
      collections: [
        {
          slug: 'customers',
          auth: {},
          custom: { frogbot: { signIn: [{ slug: 'customer', piece: 'github', label: 'GitHub' }] } },
        },
        {
          slug: 'staff',
          auth: { disableLocalStrategy },
          custom: {
            frogbot: {
              signIn: methods.map((method) => ({
                ...method,
                oauth: { clientSecret: 'private-secret' },
              })),
            },
          },
        },
      ],
    },
  },
  searchParams: { redirect: '/control/settings' },
});

describe('admin sign-in buttons', () => {
  it('renders only the admin collection methods using configured paths and safe metadata', () => {
    const view = SignInButtons(props() as never)!;
    expect(view.props.methods).toEqual(methods);
    expect(JSON.stringify(view.props)).not.toContain('private-secret');
    render(view);
    expect(screen.getByRole('link', { name: 'Continue with Google' }).getAttribute('href')).toBe(
      '/rest/v1/staff/sign-in/work?returnTo=%2Fcontrol%2Fsettings',
    );
    expect(screen.queryByRole('link', { name: 'Continue with GitHub' })).toBeNull();
    expect(screen.getByText('or')).toBeTruthy();
  });

  it('hides the password divider when the local strategy is disabled', () => {
    render(SignInButtons(props(true) as never));
    expect(screen.queryByText('or')).toBeNull();
  });

  it('renders nothing when the admin collection has no configured methods', () => {
    const input = props();
    input.payload.config.admin.user = 'password-users';
    expect(SignInButtons(input as never)).toBeNull();
    const { container } = render(
      <SignInButtonsClient methods={[]} authorizePath="/api/users/sign-in" />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('falls back to the configured admin prefix for an unsafe redirect', () => {
    const input = props();
    input.searchParams.redirect = '//evil.example';
    const view = SignInButtons(input as never)!;
    expect(view.props.returnTo).toBe('/control');
  });
});
