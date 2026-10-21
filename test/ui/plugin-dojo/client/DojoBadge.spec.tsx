import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DojoBadge } from '../../../../packages/plugins/plugin-dojo/src/client/DojoBadge.js';
import type * as Href from '../../../../packages/plugins/plugin-dojo/src/client/href.js';
import { badgeHref } from '../../../../packages/plugins/plugin-dojo/src/client/href.js';

const href = vi.hoisted(() => ({ fail: false }));

vi.mock('../../../../packages/plugins/plugin-dojo/src/client/href.js', async (importOriginal) => {
  const actual = await importOriginal<typeof Href>();

  return {
    badgeHref: (hostname: string) => {
      if (href.fail) throw new Error('badge failed');

      return actual.badgeHref(hostname);
    },
  };
});

const { jsdom } = globalThis as unknown as {
  jsdom: { reconfigure(options: { url: string }): void };
};

const base = 'https://frogbot.ai/?utm_source=dojo&utm_medium=badge';
const hiddenKey = 'frogbot-dojo-badge-hidden';
const hideLabel = 'Hide Made with FrogBot badge';

function renderBadge() {
  return render(
    <DojoBadge>
      <main>App page</main>
    </DojoBadge>,
  );
}

describe('DojoBadge', () => {
  beforeEach(() => window.sessionStorage.clear());

  afterEach(() => {
    href.fail = false;
    jsdom.reconfigure({ url: 'http://localhost:3000/' });
    vi.restoreAllMocks();
  });

  it('links to frogbot.ai with the app slug, in a new tab', () => {
    jsdom.reconfigure({ url: 'https://acme.frogbot.app/admin' });
    renderBadge();

    const link = screen.getByRole('link', { name: /Made with FrogBot · Share your own/ });

    expect(link.getAttribute('href')).toBe(
      'https://frogbot.ai/?utm_source=dojo&utm_medium=badge&utm_content=acme',
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getByText('App page')).toBeTruthy();
  });

  it('leaves the slug out on localhost', () => {
    renderBadge();

    expect(screen.getByRole('link').getAttribute('href')).toBe(base);
  });

  it('tags only <slug>.frogbot.app hosts, lowercased and encoded', () => {
    expect(badgeHref('localhost')).toBe(base);
    expect(badgeHref('acme.example.com')).toBe(base);
    expect(badgeHref('a.b.frogbot.app')).toBe(base);
    expect(badgeHref('frogbot.app')).toBe(base);
    expect(badgeHref('ACME.FROGBOT.APP')).toBe(`${base}&utm_content=acme`);
    expect(badgeHref('my app&x=1.frogbot.app')).toBe(`${base}&utm_content=my%20app%26x%3D1`);
  });

  it('hides on close for the browser session', () => {
    const { unmount } = renderBadge();

    fireEvent.click(screen.getByRole('button', { name: hideLabel }));

    expect(screen.queryByRole('link')).toBeNull();
    expect(window.sessionStorage.getItem(hiddenKey)).toBe('1');

    unmount();
    renderBadge();

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText('App page')).toBeTruthy();
  });

  it('still shows and closes when sessionStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });

    renderBadge();

    expect(screen.getByRole('link')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: hideLabel }));

    expect(screen.queryByRole('link')).toBeNull();
  });

  it('keeps the page when the badge throws', () => {
    href.fail = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    act(() => {
      renderBadge();
    });

    expect(screen.getByText('App page')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(document.querySelector('.fb-dojo-badge')).toBeNull();
  });
});
