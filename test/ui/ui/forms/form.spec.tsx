import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Form, type FormDefinition } from '../../../../packages/ui/src/exports/forms';

const formsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../packages/ui/src/forms',
);

const definition: FormDefinition = {
  slug: 'contact',
  title: 'Contact us',
  steps: [
    {
      title: 'You',
      questions: [
        { key: 'email', type: 'email', label: 'Work email', required: true },
        {
          key: 'firstName',
          type: 'text',
          label: 'First name',
          description: 'As you like to be called.',
          required: false,
        },
      ],
    },
    {
      questions: [
        {
          key: 'interest',
          type: 'radio',
          label: 'Interest',
          required: false,
          options: [
            { label: 'Sales', value: 'sales' },
            { label: 'Support', value: 'support' },
          ],
        },
        { key: 'newsletter', type: 'checkbox', label: 'Send me news', required: false },
      ],
    },
  ],
  hiddenParams: ['utm_source'],
  confirmation: { type: 'message', message: 'Thanks!' },
  closed: false,
  honeypot: 'fb-hp-test',
};

function respond(body: unknown, status = 200) {
  const fetch = vi.fn(() => Promise.resolve(Response.json(body, { status })));

  vi.stubGlobal('fetch', fetch);

  return fetch;
}

function sent(fetch: ReturnType<typeof respond>) {
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];

  return { url, body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

async function fillFirstStep(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Work email/), 'ada@example.com');
  await user.click(screen.getByRole('button', { name: 'Next' }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('Form', () => {
  it('blocks Next until required questions are answered', async () => {
    const user = userEvent.setup();

    render(<Form definition={definition} submitUrl="/api/forms/contact/submit" />);

    expect(screen.getByRole('heading', { name: 'Contact us' })).toBeTruthy();
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    const email = screen.getByLabelText(/Work email/);

    expect(screen.getByText('This field is required.')).toBeTruthy();
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByText('Step 2 of 2')).toBeNull();

    await user.type(email, 'ada@example.com');

    expect(screen.queryByText('This field is required.')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Step 2 of 2')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(screen.getByLabelText(/Work email/)).toHaveProperty('value', 'ada@example.com');
  });

  it('posts the answers and declared URL params, then shows the message', async () => {
    window.history.replaceState(null, '', '/forms/contact?utm_source=news&utm_medium=email');

    const fetch = respond({ confirmation: { type: 'message', message: 'Thanks!' } });
    const onSubmitted = vi.fn();
    const user = userEvent.setup();

    render(
      <Form
        definition={definition}
        submitUrl="/api/forms/contact/submit"
        onSubmitted={onSubmitted}
      />,
    );

    await fillFirstStep(user);
    await user.click(screen.getByLabelText('Support'));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Thanks!');
    expect(onSubmitted).toHaveBeenCalledWith({ type: 'message', message: 'Thanks!' });

    expect(sent(fetch)).toEqual({
      url: '/api/forms/contact/submit',
      body: {
        data: { email: 'ada@example.com', firstName: '', interest: 'support', newsletter: false },
        params: { utm_source: 'news' },
      },
    });
  });

  it('starts from an edit link’s saved answers and posts them back with the link', async () => {
    const fetch = respond({ confirmation: { type: 'message', message: 'Saved.' } });
    const user = userEvent.setup();
    const edit: FormDefinition = {
      ...definition,
      steps: [
        {
          questions: [
            { key: 'email', type: 'email', label: 'Work email', required: true },
            { key: 'firstName', type: 'text', label: 'First name', required: false },
            { key: 'startsOn', type: 'date', label: 'Start date', required: false },
          ],
        },
      ],
      hiddenParams: [],
      values: { email: 'ada@example.com', firstName: null, startsOn: '2026-12-01T12:00:00.000Z' },
    };

    render(<Form definition={edit} submitUrl="/api/forms/contact/submit?link=abc" />);

    expect(screen.getByLabelText(/Work email/)).toHaveProperty('value', 'ada@example.com');
    expect(screen.getByLabelText('First name')).toHaveProperty('value', '');
    expect(screen.getByLabelText('Start date')).toHaveProperty('value', '2026-12-01');

    await user.clear(screen.getByLabelText(/Work email/));
    await user.type(screen.getByLabelText(/Work email/), 'ada@lovelace.dev');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('status')).toHaveProperty('textContent', 'Saved.');
    expect(sent(fetch)).toEqual({
      url: '/api/forms/contact/submit?link=abc',
      body: {
        data: { email: 'ada@lovelace.dev', firstName: '', startsOn: '2026-12-01' },
        params: {},
      },
    });
  });

  it('shows server errors on their fields, back on the step that holds them', async () => {
    respond(
      { errors: [{ field: 'email', message: 'Enter a valid email.' }, { message: 'Nope.' }] },
      400,
    );

    const user = userEvent.setup();

    render(<Form definition={definition} submitUrl="/submit" />);

    await fillFirstStep(user);
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByText('Enter a valid email.')).toBeTruthy();
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('Nope.');
    expect(screen.getByLabelText(/Work email/).getAttribute('aria-describedby')).toContain('error');
  });

  it('shows a refused submit’s message, like a rate limit', async () => {
    respond({ error: 'Too many submissions. Try again later.' }, 429);

    const user = userEvent.setup();

    render(
      <Form definition={{ ...definition, steps: [definition.steps[0]] }} submitUrl="/submit" />,
    );

    await user.type(screen.getByLabelText(/Work email/), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Too many submissions. Try again later.',
    );
  });

  it('redirects to the confirmation URL', async () => {
    respond({ confirmation: { type: 'redirect', url: '/thanks' } });

    const assign = vi.fn();

    vi.stubGlobal('location', { ...window.location, assign, search: '' });

    const user = userEvent.setup();

    render(
      <Form definition={{ ...definition, steps: [definition.steps[0]] }} submitUrl="/submit" />,
    );

    await user.type(screen.getByLabelText(/Work email/), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/thanks'));
  });

  it('sends a filled honeypot, which people never see', async () => {
    const fetch = respond({ confirmation: { type: 'message', message: 'Thanks!' } });
    const user = userEvent.setup();

    const { container } = render(
      <Form definition={{ ...definition, steps: [definition.steps[0]] }} submitUrl="/submit" />,
    );

    const trap = container.querySelector<HTMLInputElement>('input[name="fb-hp-test"]');

    expect(trap?.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(trap?.tabIndex).toBe(-1);

    await user.type(trap!, 'https://spam.example');
    await user.type(screen.getByLabelText(/Work email/), 'bot@example.com');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await screen.findByRole('status');

    expect(sent(fetch).body.honeypot).toBe('https://spam.example');
  });

  it('needs a Turnstile token, sends it, and resets the widget after a refusal', async () => {
    const fetch = respond({ error: "We couldn't verify you're human. Try again." }, 400);
    let solve: (token: string) => void = () => {};

    const reset = vi.fn();

    const renderWidget = vi.fn(
      (_element: HTMLElement, options: { callback: (token: string) => void }) => {
        solve = options.callback;

        return 'widget-1';
      },
    );

    vi.stubGlobal('turnstile', { render: renderWidget, reset, remove: vi.fn() });

    const user = userEvent.setup();

    render(
      <Form
        definition={{ ...definition, steps: [definition.steps[0]], turnstile: { siteKey: 'site' } }}
        submitUrl="/submit"
      />,
    );

    await user.type(screen.getByLabelText(/Work email/), 'ada@example.com');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByRole('alert').textContent).toContain('Complete the check');
    expect(fetch).not.toHaveBeenCalled();
    expect(renderWidget).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ sitekey: 'site' }),
    );

    act(() => solve('token-1'));

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByText("We couldn't verify you're human. Try again.");

    expect(sent(fetch).body.turnstile).toBe('token-1');
    expect(reset).toHaveBeenCalledWith('widget-1');
  });

  it('sends chosen files as multipart parts named after their question', async () => {
    const fetch = respond({ confirmation: { type: 'message', message: 'Got it.' } });
    const user = userEvent.setup();

    render(
      <Form
        definition={{
          ...definition,
          hiddenParams: [],
          steps: [
            {
              questions: [
                { key: 'subject', type: 'text', label: 'Subject', required: true },
                {
                  key: 'attachments',
                  type: 'upload',
                  label: 'Attachments',
                  required: true,
                  hasMany: true,
                  maxFiles: 2,
                  maxFileSize: 1024 * 1024,
                  mimeTypes: ['image/*'],
                },
              ],
            },
          ],
        }}
        submitUrl="/submit"
      />,
    );

    const input = screen.getByLabelText(/Attachments/) as HTMLInputElement;
    const image = (name: string, size = 4) =>
      new File([new Uint8Array(size)], name, { type: 'image/png' });

    expect(input.type).toBe('file');
    expect(input.multiple).toBe(true);
    expect(input.accept).toBe('image/*');
    expect(screen.getByText('Up to 2 files, 1 MB each.')).toBeTruthy();

    await user.type(screen.getByLabelText(/Subject/), 'Broken page');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByText('This field is required.')).toBeTruthy();

    await user.upload(input, [image('a.png'), image('b.png'), image('c.png')]);
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByText('Attach up to 2 files.')).toBeTruthy();

    await user.upload(input, [image('big.png', 2 * 1024 * 1024)]);
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByText('"big.png" is larger than 1 MB.')).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();

    await user.upload(input, [image('a.png'), image('b.png')]);

    expect(screen.getByRole('list', { name: 'Chosen files' }).textContent).toBe('a.pngb.png');

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByText('Got it.');

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const body = init.body as FormData;

    expect(body).toBeInstanceOf(FormData);
    expect(init.headers).toBeUndefined();
    expect(JSON.parse(String(body.get('_payload')))).toEqual({
      data: { subject: 'Broken page' },
      params: {},
    });
    expect(body.getAll('attachments').map((file) => (file as File).name)).toEqual([
      'a.png',
      'b.png',
    ]);
  });

  it('shows a question by an earlier answer, skips a hidden step and sends no hidden answer', async () => {
    const ruled: FormDefinition = {
      ...definition,
      steps: [
        {
          questions: [
            {
              key: 'business',
              type: 'radio',
              label: 'Are you a business?',
              required: true,
              options: [
                { label: 'Yes', value: 'yes' },
                { label: 'No', value: 'no' },
              ],
            },
            {
              key: 'company',
              type: 'text',
              label: 'Company',
              required: true,
              rules: [{ question: 'business', operator: 'equals', value: 'yes' }],
            },
          ],
        },
        {
          title: 'Billing',
          questions: [
            {
              key: 'vat',
              type: 'text',
              label: 'VAT number',
              required: true,
              rules: [{ question: 'company', operator: 'hasValue' }],
            },
          ],
        },
        { questions: [{ key: 'note', type: 'textarea', label: 'Anything else', required: false }] },
      ],
    };

    const fetch = respond({ confirmation: { type: 'message', message: 'Thanks!' } });
    const user = userEvent.setup();

    render(<Form definition={ruled} submitUrl="/api/forms/contact/submit" />);

    expect(screen.queryByLabelText(/Company/)).toBeNull();
    expect(screen.getByText('Step 1 of 2')).toBeTruthy();

    await user.click(screen.getByLabelText('Yes'));
    await user.type(screen.getByLabelText(/Company/), 'Acme');

    expect(screen.getByText('Step 1 of 3')).toBeTruthy();

    await user.click(screen.getByLabelText('No'));

    expect(screen.queryByLabelText(/Company/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.queryByText('This field is required.')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Billing' })).toBeNull();
    expect(screen.getByText('Step 2 of 2')).toBeTruthy();
    expect(screen.getByLabelText(/Anything else/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByLabelText('Yes'));
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByRole('heading', { name: 'Billing' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('This field is required.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Back' }));
    await user.click(screen.getByLabelText('No'));
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    await screen.findByRole('status');

    expect(sent(fetch).body.data).toEqual({ business: 'no', note: '' });
  });

  it('sends nothing without a submit URL, and shows the confirmation, as a preview does', async () => {
    const user = userEvent.setup();
    const fetch = respond({});

    render(<Form definition={definition} />);
    await fillFirstStep(user);
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByRole('status').textContent).toBe('Thanks!');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('shows a preview where a redirect would go', async () => {
    const user = userEvent.setup();

    render(
      <Form definition={{ ...definition, confirmation: { type: 'redirect', url: '/thanks' } }} />,
    );

    await fillFirstStep(user);
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(screen.getByRole('status').textContent).toBe('Visitors go to /thanks after sending.');
  });

  it('shows a closed form’s notice instead of its questions', () => {
    render(<Form definition={{ ...definition, closed: true }} submitUrl="/submit" />);

    expect(screen.getByText('This form is closed.')).toBeTruthy();
    expect(screen.queryByLabelText(/Work email/)).toBeNull();
  });

  it('imports no Payload, Next.js or FrogBot server module', () => {
    const sources = readdirSync(formsDir)
      .filter((file) => /\.tsx?$/.test(file))
      .map((file) => readFileSync(path.join(formsDir, file), 'utf8'));

    const imports = sources.flatMap((source) =>
      [...source.matchAll(/from '([^']+)'/g)].map(([, specifier]) => specifier),
    );

    expect(imports.length).toBeGreaterThan(0);
    expect(
      imports.filter((specifier) => /^(payload|@payloadcms|next|frogbot)(\/|$)/.test(specifier)),
    ).toEqual([]);
    expect(imports.filter((specifier) => specifier.startsWith('../admin'))).toEqual([]);
  });
});
