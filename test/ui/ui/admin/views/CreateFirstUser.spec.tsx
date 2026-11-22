import { act, render, screen } from '@testing-library/react';
import type { ClientField } from 'payload';
import { getFieldPaths } from 'payload/shared';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateFirstUserClient } from '../../../../../packages/ui/src/admin/views/CreateFirstUser/index.client.js';
import { CreateFirstUserView } from '../../../../../packages/ui/src/admin/views/CreateFirstUser/index.js';
import { requiredFields } from '../../../../../packages/ui/src/admin/views/CreateFirstUser/requiredFields.js';

const ui = vi.hoisted(() => ({
  fields: [] as unknown[],
  rendered: undefined as unknown,
  handleResponse: undefined as
    | undefined
    | ((res: Response, success: (m: string) => void, error: (m: string) => void) => Promise<void>),
  formProps: undefined as undefined | Record<string, unknown>,
  setUser: vi.fn(),
  push: vi.fn(),
  dispatchFields: vi.fn(),
  setIsValid: vi.fn(),
  setSubmitted: vi.fn(),
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
  EmailAndUsernameFields: ({ loginWithUsername }: { loginWithUsername?: unknown }) => (
    <>
      <input name="email" />
      {loginWithUsername ? <input name="username" /> : null}
    </>
  ),
  Form: ({
    children,
    handleResponse,
    ...props
  }: {
    children: ReactNode;
    handleResponse: typeof ui.handleResponse;
  }) => {
    ui.handleResponse = handleResponse;
    ui.formProps = props;

    return <form>{children}</form>;
  },
  FormSubmit: ({ children }: { children: ReactNode }) => <button type="submit">{children}</button>,
  OperationProvider: ({ children }: { children: ReactNode }) => children,
  PasswordField: () => <input name="password" />,
  RenderFields: ({ fields }: { fields: { name?: string; admin?: { disabled?: boolean } }[] }) => {
    ui.rendered = fields;

    return fields.map((field) =>
      field.admin?.disabled ? null : <input key={field.name} name={field.name} />,
    );
  },
  useAuth: () => ({ setUser: ui.setUser, user: null }),
  useConfig: () => ({
    config: { admin: { routes: { login: '/login' } }, routes: { admin: '/admin', api: '/api' } },
    getEntityConfig: () => ({ fields: ui.fields }),
  }),
  useForm: () => ({
    dispatchFields: ui.dispatchFields,
    setIsValid: ui.setIsValid,
    setSubmitted: ui.setSubmitted,
  }),
  useRouter: () => ({ push: ui.push }),
  useRouteTransition: () => ({ startRouteTransition: (callback: () => void) => callback() }),
  useTranslation: () => ({ t: (key: string) => key }),
}));

const text = (name: string, required = false) =>
  ({ name, type: 'text', ...(required ? { required } : {}) }) as ClientField;

const hidden = <T extends object>(field: T) =>
  ({ ...field, admin: { disabled: true } }) as unknown as ClientField;

const containerPaths = (
  fields: ClientField[],
  parentPath = '',
  parentSchemaPath = 'users',
  parentIndexPath = '',
): Record<string, string> =>
  Object.assign(
    {},
    ...fields.map((field, index) => {
      const { indexPath, path, schemaPath } = getFieldPaths({
        field,
        index,
        parentIndexPath,
        parentPath,
        parentSchemaPath,
      });

      const own = 'label' in field && !('name' in field) ? { [String(field.label)]: path } : {};

      if (field.type === 'tabs') {
        return Object.assign(
          own,
          ...field.tabs.map((tab, tabIndex) => {
            const paths = getFieldPaths({
              field: tab,
              index: tabIndex,
              parentIndexPath: indexPath,
              parentPath: path,
              parentSchemaPath: schemaPath,
            });

            return containerPaths(tab.fields, paths.path, paths.schemaPath, paths.indexPath);
          }),
        );
      }

      return field.type === 'row' || field.type === 'collapsible' || field.type === 'group'
        ? { ...own, ...containerPaths(field.fields, path, schemaPath, indexPath) }
        : own;
    }),
  );

describe('requiredFields', () => {
  it('keeps required fields, and hides optional ones and the ones the form draws', () => {
    const role = { name: 'role', type: 'select', required: true, options: [] } as ClientField;

    expect(
      requiredFields(
        [text('email', true), text('username', true), text('bio'), role],
        ['email', 'username'],
      ),
    ).toEqual([
      hidden(text('email', true)),
      hidden(text('username', true)),
      hidden(text('bio')),
      role,
    ]);
    expect(requiredFields([text('email', true), text('username', true)], ['email'])).toEqual([
      hidden(text('email', true)),
      text('username', true),
    ]);
    expect(requiredFields([text('email', true), text('bio')], ['email'])).toEqual([]);
  });

  it('keeps a container only with its required children, each field in its place', () => {
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
      { type: 'row', fields: [text('first', true), hidden(text('nickname'))] },
      hidden(fields[1]),
      { name: 'address', type: 'group', fields: [text('city', true), hidden(text('line2'))] },
      {
        type: 'tabs',
        tabs: [{ label: 'Profile', fields: [text('title', true), hidden(text('motto'))] }],
      },
      hidden(fields[4]),
    ]);
  });

  it('keeps an optional tab before a kept one, empty, and drops the ones after', () => {
    const tabs = {
      type: 'tabs',
      tabs: [
        { label: 'Social', fields: [text('twitter')] },
        { label: 'Profile', fields: [text('title', true)] },
        { label: 'Extra', fields: [text('motto')] },
      ],
    } as ClientField;

    expect(requiredFields([tabs])).toEqual([
      {
        type: 'tabs',
        tabs: [
          { label: 'Social', fields: [] },
          { label: 'Profile', fields: [text('title', true)] },
        ],
      },
    ]);
  });

  it('draws each kept unnamed container at the path the server built its form state for', () => {
    const fields = [
      { type: 'row', label: 'Extras', admin: { condition: () => false }, fields: [text('nick')] },
      { type: 'row', label: 'Role row', fields: [text('role', true)] },
      text('bio'),
      {
        name: 'profile',
        type: 'group',
        fields: [
          { type: 'collapsible', label: 'Optional block', fields: [text('motto')] },
          {
            type: 'row',
            label: 'Outer row',
            fields: [
              { type: 'collapsible', label: 'Optional inner', fields: [text('website')] },
              { type: 'collapsible', label: 'Needed inner', fields: [text('title', true)] },
            ],
          },
        ],
      },
      {
        type: 'tabs',
        label: 'Tabs',
        tabs: [
          { label: 'Optional tab', fields: [text('twitter')] },
          {
            label: 'Needed tab',
            fields: [{ type: 'row', label: 'Tab row', fields: [text('plan', true)] }],
          },
        ],
      },
    ] as unknown as ClientField[];

    const before = containerPaths(fields);
    const after = containerPaths(requiredFields(fields));

    for (const label of ['Role row', 'Outer row', 'Needed inner', 'Tabs', 'Tab row']) {
      expect([label, after[label]]).toEqual([label, before[label]]);
    }
  });

  it('drops a container whose only required child is hidden or disabled', () => {
    const fields = [
      { type: 'collapsible', label: 'Internal', fields: [hidden(text('tenant', true))] },
      { type: 'row', fields: [{ ...text('secret', true), hidden: true }] },
    ] as unknown as ClientField[];

    expect(requiredFields(fields)).toEqual([]);
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

    for (const mock of [ui.setUser, ui.push, ui.dispatchFields, ui.setIsValid, ui.setSubmitted]) {
      mock.mockReset();
    }
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
    expect(ui.formProps).toMatchObject({
      action: '/api/users/first-register',
      disableSuccessStatus: true,
      method: 'POST',
    });
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

  const respond = (status: number, body: unknown, errorToast = vi.fn()) =>
    act(() => ui.handleResponse!(Response.json(body, { status }), vi.fn(), errorToast));

  it.each([
    [false, ['email', 'password', 'confirm-password', 'username']],
    [{ requireEmail: false }, ['email', 'username', 'password', 'confirm-password']],
  ])(
    "draws an app's required username field once, with loginWithUsername %o",
    (loginWithUsername, expected) => {
      ui.fields = [{ name: 'username', type: 'text', required: true }];

      const { container } = render(
        <CreateFirstUserClient
          docPermissions={{} as never}
          initialState={{ 'confirm-password': {} }}
          loginWithUsername={loginWithUsername}
          userSlug="users"
        />,
      );

      expect([...container.querySelectorAll('input')].map((input) => input.name)).toEqual(expected);
    },
  );

  it('signs the new user in and goes to the admin', async () => {
    renderClient();

    const json = { user: { id: 1 }, token: 't', exp: 1 };

    await respond(200, json);

    expect(ui.setUser).toHaveBeenCalledWith(json);
    expect(ui.push).toHaveBeenCalledWith('/admin');
  });

  it("shows a sign-in link when two-factor's require answers 202", async () => {
    renderClient();

    await respond(202, { twoFactor: 'setup', url: '/api/users/two-factor' });

    expect(screen.getByText('Account created. Sign in to set up two-factor.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'authentication:login' }).getAttribute('href')).toBe(
      '/admin/login',
    );
    expect(screen.queryByRole('button', { name: 'authentication:createUser' })).toBeNull();
    expect(ui.setUser).not.toHaveBeenCalled();
    expect(ui.push).not.toHaveBeenCalled();
  });

  it('puts a server field error on its field, toasts the rest, and stays on the form', async () => {
    const errorToast = vi.fn();
    const fieldError = {
      path: 'email',
      message: 'A user with the given email is already registered.',
    };

    renderClient();

    await respond(
      400,
      {
        errors: [
          { message: 'The following field is invalid: email', data: { errors: [fieldError] } },
        ],
      },
      errorToast,
    );

    expect(ui.dispatchFields).toHaveBeenCalledWith({
      type: 'ADD_SERVER_ERRORS',
      errors: [fieldError],
    });
    expect(ui.setIsValid).toHaveBeenCalledWith(false);
    expect(ui.setSubmitted).toHaveBeenCalledWith(true);
    expect(errorToast).toHaveBeenCalledWith('The following field is invalid: email');
    expect(ui.setUser).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'authentication:createUser' })).toBeTruthy();
  });

  it('never shows a blank error toast', async () => {
    const errorToast = vi.fn();

    renderClient();
    await respond(400, { errors: [{}, { message: ' ' }] }, errorToast);

    expect(errorToast).toHaveBeenCalledWith('error:unknown');
    expect(ui.dispatchFields).not.toHaveBeenCalled();
  });

  it('shows the status text for an error that is not JSON', async () => {
    const errorToast = vi.fn();

    renderClient();

    await act(() =>
      ui.handleResponse!(
        new Response('<html>boom</html>', { status: 500, statusText: 'Internal Server Error' }),
        vi.fn(),
        errorToast,
      ),
    );

    expect(errorToast).toHaveBeenCalledWith('Internal Server Error');
    expect(screen.getByRole('button', { name: 'authentication:createUser' })).toBeTruthy();
  });
});
