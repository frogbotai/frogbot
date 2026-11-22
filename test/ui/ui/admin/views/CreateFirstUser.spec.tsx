import { act, render, screen } from '@testing-library/react';
import type { ClientField } from 'payload';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateFirstUserClient } from '../../../../../packages/ui/src/admin/views/CreateFirstUser/index.client.js';
import { CreateFirstUserView } from '../../../../../packages/ui/src/admin/views/CreateFirstUser/index.js';
import { requiredFields } from '../../../../../packages/ui/src/admin/views/CreateFirstUser/requiredFields.js';

const ui = vi.hoisted(() => ({
  fields: [] as unknown[],
  rendered: undefined as unknown,
  onSuccess: undefined as undefined | ((json: unknown) => Promise<void> | void),
  formProps: undefined as undefined | Record<string, unknown>,
  setUser: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@payloadcms/ui/utilities/buildFormState', () => ({
  buildFormState: vi.fn(() =>
    Promise.resolve({ state: { email: { value: '' }, 'confirm-password': {} } }),
  ),
}));

vi.mock('@payloadcms/ui', () => ({
  Button: ({ el, url, children }: { el: string; url: string; children: ReactNode }) =>
    el === 'anchor' || el === 'link' ? <a href={url}>{children}</a> : <span>{children}</span>,
  ConfirmPasswordField: () => <input name="confirm-password" />,
  DocumentInfoProvider: ({ children }: { children: ReactNode }) => children,
  EmailAndUsernameFields: () => <input name="email" />,
  Form: ({
    children,
    onSuccess,
    ...props
  }: {
    children: ReactNode;
    onSuccess: (json: unknown) => void;
  }) => {
    ui.onSuccess = onSuccess;
    ui.formProps = props;

    return <form>{children}</form>;
  },
  FormSubmit: ({ children }: { children: ReactNode }) => <button type="submit">{children}</button>,
  OperationProvider: ({ children }: { children: ReactNode }) => children,
  PasswordField: () => <input name="password" />,
  RenderFields: ({ fields }: { fields: { name?: string }[] }) => {
    ui.rendered = fields;

    return fields.map((field) => <input key={field.name} name={field.name} />);
  },
  useAuth: () => ({ setUser: ui.setUser, user: null }),
  useConfig: () => ({
    config: { admin: { routes: { login: '/login' } }, routes: { admin: '/admin', api: '/api' } },
    getEntityConfig: () => ({ fields: ui.fields }),
  }),
  useRouter: () => ({ push: ui.push }),
  useRouteTransition: () => ({ startRouteTransition: (callback: () => void) => callback() }),
  useTranslation: () => ({ t: (key: string) => key }),
}));

const text = (name: string, required = false) =>
  ({ name, type: 'text', ...(required ? { required } : {}) }) as ClientField;

describe('requiredFields', () => {
  it('keeps required fields, drops optional and auth fields', () => {
    const role = { name: 'role', type: 'select', required: true, options: [] } as ClientField;

    expect(
      requiredFields([text('email', true), text('username', true), text('bio'), role]),
    ).toEqual([role]);
  });

  it('keeps a container only with its required children', () => {
    const fields = [
      { type: 'row', fields: [text('first', true), text('nickname')] },
      { type: 'collapsible', label: 'Extra', fields: [text('website')] },
      { name: 'address', type: 'group', fields: [text('city', true), text('line2')] },
      {
        type: 'tabs',
        tabs: [
          { label: 'Profile', fields: [text('title', true), text('motto')] },
          { label: 'Social', fields: [text('twitter')] },
        ],
      },
      { name: 'notes', type: 'ui' },
    ] as ClientField[];

    expect(requiredFields(fields)).toEqual([
      { type: 'row', fields: [text('first', true)] },
      { name: 'address', type: 'group', fields: [text('city', true)] },
      { type: 'tabs', tabs: [{ label: 'Profile', fields: [text('title', true)] }] },
    ]);
  });

  it('keeps a required field named email when it is nested', () => {
    const fields = [
      { name: 'contact', type: 'group', fields: [text('email', true)] },
    ] as ClientField[];

    expect(requiredFields(fields)).toEqual(fields);
  });
});

const props = {
  initPageResult: {
    locale: undefined,
    req: {
      t: (key: string) => key,
      payload: {
        collections: { users: { config: { fields: [], auth: { loginWithUsername: false } } } },
        config: {
          admin: { user: 'users' },
          routes: { api: '/api', admin: '/admin' },
          collections: [
            {
              slug: 'users',
              auth: { disableLocalStrategy: false },
              custom: {
                frogbot: { signIn: [{ slug: 'google', piece: 'google', label: 'Google' }] },
              },
            },
          ],
        },
      },
    },
  },
};

describe('create-first-user view', () => {
  beforeEach(() => {
    ui.fields = [];
    ui.setUser.mockReset();
    ui.push.mockReset();
  });

  it('renders the heading, the form, then the divider and sign-in buttons', async () => {
    render(await CreateFirstUserView(props as never));

    const heading = screen.getByRole('heading', { name: 'general:welcome' });
    const submit = screen.getByRole('button', { name: 'authentication:createUser' });
    const divider = screen.getByText('or');
    const button = screen.getByRole('link', { name: 'Continue with Google' });

    for (const [before, after] of [
      [heading, submit],
      [submit, divider],
      [divider, button],
    ]) {
      expect(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    expect(button.getAttribute('href')).toBe('/api/users/sign-in/google?returnTo=%2Fadmin');
    expect(ui.formProps).toMatchObject({ action: '/api/users/first-register', method: 'POST' });
  });

  const renderClient = () =>
    render(
      <CreateFirstUserClient
        docPermissions={{} as never}
        initialState={{ 'confirm-password': {} }}
        userSlug="users"
      />,
    );

  it('asks for email, password, confirm and required fields only', () => {
    ui.fields = [
      { name: 'bio', type: 'textarea' },
      { name: 'role', type: 'select', required: true, options: ['owner', 'member'] },
    ];

    const { container } = renderClient();
    const names = [...container.querySelectorAll('input')].map((input) => input.name);

    expect(names).toEqual(['email', 'password', 'confirm-password', 'role']);
  });

  it('signs the new user in and goes to the admin', async () => {
    renderClient();

    const json = { user: { id: 1 }, token: 't', exp: 1 };

    await act(() => ui.onSuccess!(json));

    expect(ui.setUser).toHaveBeenCalledWith(json);
    expect(ui.push).toHaveBeenCalledWith('/admin');
  });

  it("shows a sign-in link when two-factor's require answers 202", async () => {
    renderClient();

    await act(() => ui.onSuccess!({ twoFactor: 'setup', url: '/api/users/two-factor' }));

    expect(screen.getByText('Account created. Sign in to set up two-factor.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'authentication:login' }).getAttribute('href')).toBe(
      '/admin/login',
    );
    expect(screen.queryByRole('button', { name: 'authentication:createUser' })).toBeNull();
    expect(ui.setUser).not.toHaveBeenCalled();
    expect(ui.push).not.toHaveBeenCalled();
  });
});
