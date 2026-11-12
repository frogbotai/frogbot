import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BuildNotice } from '../../../../../packages/ui/src/admin/elements/BuildNotice/index.client';

vi.mock('@payloadcms/ui', () => ({
  useConfig: () => ({ config: { routes: { api: '/api' } } }),
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

beforeEach(() => {
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

    expect(screen.queryByText('Updated, reload')).toBeNull();

    await focusTab();

    expect(fetchMock).toHaveBeenCalledWith('/api/health', {
      cache: 'no-store',
      credentials: 'same-origin',
    });
    expect(screen.getByRole('status').textContent).toContain('Updated, reload');
  });

  it('counts the header on an error response too', async () => {
    serve('build-b', 503);
    render(<BuildNotice buildId="build-a" />);
    await focusTab();

    expect(screen.getByText('Updated, reload')).toBeTruthy();
  });

  it.each([
    ['the same build', 'build-a'],
    ['no header', null],
  ])('shows nothing for %s', async (_name, build) => {
    serve(build);
    render(<BuildNotice buildId="build-a" />);
    await focusTab();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Updated, reload')).toBeNull();
  });

  it('shows nothing when the check fails', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    render(<BuildNotice buildId="build-a" />);
    await focusTab();

    expect(screen.queryByText('Updated, reload')).toBeNull();
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

  it('reloads only when Reload is clicked', async () => {
    const reload = vi.fn();

    vi.stubGlobal('location', { ...window.location, reload });
    serve('build-b');
    render(<BuildNotice buildId="build-a" />);
    await focusTab();

    expect(reload).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a build ID, as in next dev', async () => {
    serve('build-b');
    render(<BuildNotice />);
    await focusTab();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
