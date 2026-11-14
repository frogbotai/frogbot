import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BuildNotice } from '../../../../../packages/ui/src/admin/elements/BuildNotice/index.client';

const route = vi.hoisted(() => ({ pathname: '/admin' }));

vi.mock('@payloadcms/ui', () => ({
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
  usePathname: () => route.pathname,
}));

const fetchMock = vi.fn<typeof fetch>();

function serve(build: string | null, status = 200) {
  fetchMock.mockResolvedValue(
    new Response(null, { headers: build ? { 'x-frogbot-build': build } : {}, status }),
  );
}

async function focusTab() {
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  route.pathname = '/admin';
  vi.useFakeTimers({ now: 0, toFake: ['Date'] });
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('BuildNotice', () => {
  it('asks for a reload when the tab regains focus on a newer build', async () => {
    serve('build-b');
    render(<BuildNotice buildId="build-a" />);

    expect(screen.queryByText('A new version is available')).toBeNull();

    await focusTab();

    expect(fetchMock).toHaveBeenCalledWith('/api/health', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    expect(screen.getByRole('status').textContent).toContain('A new version is available');
  });

  it('counts the header on an error response too', async () => {
    serve('build-b', 503);
    render(<BuildNotice buildId="build-a" />);
    await focusTab();

    expect(screen.getByText('A new version is available')).toBeTruthy();
  });

  it.each([
    ['the same build', 'build-a'],
    ['no header', null],
  ])('shows nothing for %s', async (_name, build) => {
    serve(build);
    render(<BuildNotice buildId="build-a" />);
    await focusTab();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('A new version is available')).toBeNull();
  });

  it('shows nothing when the check fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    render(<BuildNotice buildId="build-a" />);
    await focusTab();

    expect(screen.queryByText('A new version is available')).toBeNull();
  });

  it('checks at most once every 5 seconds', async () => {
    serve('build-a');
    render(<BuildNotice buildId="build-a" />);

    await focusTab();

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });

    await focusTab();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(5000);
    await focusTab();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reloads only when Refresh is clicked', async () => {
    const reload = vi.fn();

    vi.stubGlobal('location', { ...window.location, reload });
    serve('build-b');
    render(<BuildNotice buildId="build-a" />);
    await focusTab();

    expect(reload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a build ID, as in next dev', async () => {
    serve('build-b');
    render(<BuildNotice />);
    await focusTab();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks when the admin navigates to another page, within the same throttle', async () => {
    serve('build-b');
    const { rerender } = render(<BuildNotice buildId="build-a" />);
    await settle();

    expect(fetchMock).not.toHaveBeenCalled();

    route.pathname = '/admin/collections/posts';
    rerender(<BuildNotice buildId="build-a" />);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText('A new version is available')).toBeTruthy();
  });

  it('skips a navigation check inside the 5 second throttle', async () => {
    serve('build-a');
    const { rerender } = render(<BuildNotice buildId="build-a" />);
    await focusTab();

    route.pathname = '/admin/collections/posts';
    rerender(<BuildNotice buildId="build-a" />);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.setSystemTime(5000);
    route.pathname = '/admin/collections/pages';
    rerender(<BuildNotice buildId="build-a" />);
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      'a webpack ChunkLoadError',
      Object.assign(new Error('Loading chunk 42 failed.'), { name: 'ChunkLoadError' }),
    ],
    ['a Turbopack chunk failure', new Error('Failed to load chunk /_next/static/chunks/a1.js')],
    [
      'a failed dynamic import',
      new TypeError('Failed to fetch dynamically imported module: /x.js'),
    ],
  ])('shows the notice after %s on a newer build', async (_name, error) => {
    serve('build-a');
    render(<BuildNotice buildId="build-a" />);
    await focusTab();
    serve('build-b');

    await act(async () => {
      window.dispatchEvent(Object.assign(new Event('unhandledrejection'), { reason: error }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.getByText('A new version is available')).toBeTruthy();
  });

  it('checks on a chunk error event', async () => {
    serve('build-b');
    render(<BuildNotice buildId="build-a" />);

    await act(async () => {
      window.dispatchEvent(
        new ErrorEvent('error', {
          error: Object.assign(new Error('Loading CSS chunk 7 failed.'), {
            name: 'ChunkLoadError',
          }),
        }),
      );

      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('A new version is available')).toBeTruthy();
  });

  it('ignores other errors, and a chunk error on the same build', async () => {
    serve('build-a');
    render(<BuildNotice buildId="build-a" />);

    await act(async () => {
      window.dispatchEvent(
        Object.assign(new Event('unhandledrejection'), { reason: new Error('boom') }),
      );

      await Promise.resolve();
    });

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      window.dispatchEvent(
        Object.assign(new Event('unhandledrejection'), {
          reason: Object.assign(new Error('Loading chunk 1 failed.'), { name: 'ChunkLoadError' }),
        }),
      );

      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('A new version is available')).toBeNull();
  });
});
