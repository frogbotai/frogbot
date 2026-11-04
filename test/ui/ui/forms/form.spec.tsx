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
