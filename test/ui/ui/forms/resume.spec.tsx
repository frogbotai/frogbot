import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { Form, type FormDefinition } from '../../../../packages/ui/src/exports/forms';

const SUBMIT = '/api/forms/signup/submit';
const EVENTS = '/api/forms/signup/events';
const STORED = 'frogbot-form:signup';

const definition: FormDefinition = {
  slug: 'signup',
  title: 'Sign up',
  steps: [
    {
      questions: [
        { key: 'email', type: 'email', label: 'Email', required: true },
        {
          key: 'business',
          type: 'radio',
          label: 'Are you a business?',
          required: false,
          options: [
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' },
          ],
        },
        {
          key: 'company',
          type: 'text',
          label: 'Company',
          required: false,
          rules: [{ question: 'business', operator: 'equals', value: 'yes' }],
        },
        { key: 'news', type: 'checkbox', label: 'Send me news', required: false },
        { key: 'cv', type: 'upload', label: 'CV', required: false },
      ],
    },
  ],
  hiddenParams: [],
  confirmation: { type: 'message', message: 'Thanks!' },
  closed: false,
  honeypot: 'fb-hp-test',
};

function respond(body: unknown) {
  const fetch = vi.fn((url: string, _init?: RequestInit) =>
    Promise.resolve(
      url === EVENTS ? new Response(null, { status: 204 }) : Response.json(body, { status: 200 }),
    ),
  );

  vi.stubGlobal('fetch', fetch);

  return fetch;
}

function pings(fetch: ReturnType<typeof respond>) {
  return fetch.mock.calls
    .filter(([url]) => url === EVENTS)
    .map(([, init]) => (JSON.parse(String(init?.body)) as { type: string }).type);
}

function stored(): unknown {
  const raw = window.localStorage.getItem(STORED);

  return raw === null ? null : JSON.parse(raw);
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe('Form resume', () => {
  it('keeps answers, not files, across a reload and forgets them after a submit', async () => {
    respond({ confirmation: { type: 'message', message: 'Thanks!' } });
    const user = userEvent.setup();
    const first = render(<Form definition={definition} submitUrl={SUBMIT} />);

    await user.type(screen.getByLabelText(/Email/), 'ada@example.com');
    await user.click(screen.getByLabelText('Yes'));
    await user.type(screen.getByLabelText('Company'), 'Acme');
    await user.click(screen.getByLabelText('Send me news'));
    await user.upload(screen.getByLabelText('CV'), new File(['cv'], 'cv.pdf'));

    expect(stored()).toEqual({
      email: 'ada@example.com',
      business: 'yes',
      company: 'Acme',
      news: true,
    });

    first.unmount();
    render(<Form definition={definition} submitUrl={SUBMIT} />);

    await waitFor(() => {
      expect(screen.getByLabelText(/Email/)).toHaveProperty('value', 'ada@example.com');
    });

    expect(screen.getByLabelText('Company')).toHaveProperty('value', 'Acme');
    expect(screen.getByLabelText('Send me news').getAttribute('aria-checked')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await screen.findByRole('status');

    expect(stored()).toBeNull();
  });

  it('drops a kept answer to a question that is now hidden, and ignores answers of the wrong kind', async () => {
    window.localStorage.setItem(
      STORED,
      JSON.stringify({ email: 'ada@example.com', business: 'no', company: 'Acme', news: 'yes' }),
    );

    const user = userEvent.setup();

    render(<Form definition={definition} submitUrl={SUBMIT} />);

    await waitFor(() => {
      expect(screen.getByLabelText('No').getAttribute('aria-checked')).toBe('true');
    });

    expect(screen.getByLabelText('Send me news').getAttribute('aria-checked')).toBe('false');

    await user.click(screen.getByLabelText('Yes'));

    expect(screen.getByLabelText('Company')).toHaveProperty('value', '');
  });

  it('survives storage that is not JSON', async () => {
    window.localStorage.setItem(STORED, '{not json');
    const user = userEvent.setup();

    render(<Form definition={definition} submitUrl={SUBMIT} />);
    await user.type(screen.getByLabelText(/Email/), 'ada@example.com');

    expect(stored()).toEqual({ email: 'ada@example.com', business: '', company: '', news: false });
  });

  it('keeps nothing for an edit link or a preview', async () => {
    const user = userEvent.setup();
    const edit = render(
      <Form
        definition={{ ...definition, values: { email: 'ada@example.com' } }}
        submitUrl={`${SUBMIT}?link=abc`}
      />,
    );

    await user.type(screen.getByLabelText(/Email/), 'x');
    edit.unmount();

    render(<Form definition={definition} />);
    await user.type(screen.getByLabelText(/Email/), 'grace@example.com');

    expect(stored()).toBeNull();
  });
});

describe('Form counts', () => {
  it('pings one view on load and one start on the first answer', async () => {
    const fetch = respond({});
    const user = userEvent.setup();

    render(
      <Form definition={{ ...definition, analytics: true }} eventUrl={EVENTS} submitUrl={SUBMIT} />,
    );

    await waitFor(() => {
      expect(pings(fetch)).toEqual(['view']);
    });

    await user.type(screen.getByLabelText(/Email/), 'ada');
    await user.click(screen.getByLabelText('Yes'));

    expect(pings(fetch)).toEqual(['view', 'start']);
  });

  it('pings no start for a visitor who comes back to kept answers', async () => {
    window.localStorage.setItem(STORED, JSON.stringify({ email: 'ada@example.com' }));
    const fetch = respond({});
    const user = userEvent.setup();

    render(
      <Form definition={{ ...definition, analytics: true }} eventUrl={EVENTS} submitUrl={SUBMIT} />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/Email/)).toHaveProperty('value', 'ada@example.com');
    });

    await user.type(screen.getByLabelText(/Email/), 'x');

    expect(pings(fetch)).toEqual(['view']);
  });

  it('keeps nothing for a visitor who only looked, so they count as a start when they come back and answer', async () => {
    const fetch = respond({});
    const user = userEvent.setup();
    const counted = { ...definition, analytics: true as const };
    const first = render(<Form definition={counted} eventUrl={EVENTS} submitUrl={SUBMIT} />);

    await waitFor(() => {
      expect(pings(fetch)).toEqual(['view']);
    });

    first.unmount();

    expect(stored()).toBeNull();

    render(<Form definition={counted} eventUrl={EVENTS} submitUrl={SUBMIT} />);

    await waitFor(() => {
      expect(pings(fetch)).toEqual(['view', 'view']);
    });

    await user.type(screen.getByLabelText(/Email/), 'a');

    expect(pings(fetch)).toEqual(['view', 'view', 'start']);
  });

  it('pings nothing when the definition has no analytics, or the form is closed', async () => {
    const fetch = respond({});
    const user = userEvent.setup();
    const open = render(<Form definition={definition} eventUrl={EVENTS} submitUrl={SUBMIT} />);

    await user.type(screen.getByLabelText(/Email/), 'ada');
    open.unmount();

    render(
      <Form
        definition={{ ...definition, analytics: true, closed: true }}
        eventUrl={EVENTS}
        submitUrl={SUBMIT}
      />,
    );

    expect(pings(fetch)).toEqual([]);
  });
});
