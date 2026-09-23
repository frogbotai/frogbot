import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessagePart } from '../../../../packages/ui/src/chat/message-part';
import { ChatProvider } from '../../../../packages/ui/src/chat/provider';

const apiBase = 'https://frogbot.example/custom-api';
const assetsSlug = 'private-assets';
const metadataPath = `/${assetsSlug}/asset-1?depth=0`;
const filePath = `/${assetsSlug}/file/chart%20one.png`;
const reference = {
  type: 'file-reference',
  id: 'asset-1',
  filename: 'claimed.txt',
  mediaType: 'text/plain',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function readBlob(blob: Blob) {
  return new Promise<string | ArrayBuffer | null>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function createAdapter(routes: Record<string, () => Response | Promise<Response>> = {}) {
  const fetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
    const path = String(input).slice(apiBase.length);

    if (routes[path]) return routes[path]();

    if (path === '/frogbot') {
      return Response.json({
        chat: { enabled: true, assetsSlug, chatsSlug: 'chats', messagesSlug: 'messages' },
        files: { slug: 'files' },
        agents: [],
      });
    }

    if (path === '/agents') return Response.json({ agents: [] });

    if (path === metadataPath) {
      return Response.json({ id: 'asset-1', filename: 'chart one.png', mimeType: 'image/png' });
    }

    if (path === filePath) {
      return new Response('image bytes', { headers: { 'content-type': 'image/png' } });
    }

    throw new Error(`Unexpected request: ${input}`);
  });

  return { apiBase, fetch, headers: async () => ({ Authorization: 'Bearer private-session' }) };
}

describe('file references', () => {
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:chat-asset');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();

    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = createObjectURL;
        static revokeObjectURL = revokeObjectURL;
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('loads metadata and image bytes with adapter credentials and preserves FilePart rendering', async () => {
    const metadata = deferred<Response>();
    const adapter = createAdapter({ [metadataPath]: () => metadata.promise });

    const { container, unmount } = render(
      <ChatProvider adapter={adapter}>
        <MessagePart part={reference} />
      </ChatProvider>,
    );

    expect(screen.getByRole('status').textContent).toBe('Loading attachment: claimed.txt');
    expect(screen.queryByRole('img')).toBeNull();

    await act(async () => {
      metadata.resolve(
        Response.json({ id: 'asset-1', filename: 'chart one.png', mimeType: 'image/png' }),
      );
    });

    const image = await screen.findByRole('img', { name: 'chart one.png' });

    expect(image.getAttribute('src')).toBe('blob:chat-asset');
    expect(image.className).toBe('fb-file-part__image');
    expect(container.querySelector('figure')?.className).toBe('fb-file-part fb-file-part--image');
    expect(container.querySelector('figcaption')?.textContent).toBe('chart one.png');
    expect(screen.queryByRole('status')).toBeNull();

    expect(adapter.fetch.mock.calls.map(([url]) => String(url))).toEqual([
      `${apiBase}/frogbot`,
      `${apiBase}/agents`,
      `${apiBase}${metadataPath}`,
      `${apiBase}${filePath}`,
    ]);

    for (const [, init] of adapter.fetch.mock.calls) {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer private-session');
    }

    expect(await readBlob(createObjectURL.mock.calls[0][0])).toBe('image bytes');

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:chat-asset');
  });

  it('renders an authenticated document as the existing downloadable link', async () => {
    const adapter = createAdapter({
      [metadataPath]: () =>
        Response.json({ id: 'asset-1', filename: 'notes.txt', mimeType: 'text/plain' }),
      [`/${assetsSlug}/file/notes.txt`]: () =>
        new Response('Private notes', { headers: { 'content-type': 'text/plain' } }),
    });

    render(
      <ChatProvider adapter={adapter}>
        <MessagePart part={reference} />
      </ChatProvider>,
    );

    const link = await screen.findByRole('link', { name: 'notes.txt' });

    expect(link.getAttribute('href')).toBe('blob:chat-asset');
    expect(link.getAttribute('download')).toBe('notes.txt');
    expect(link.className).toBe('fb-file-part fb-file-part--download');
    expect(await readBlob(createObjectURL.mock.calls[0][0])).toBe('Private notes');

    link.focus();

    expect(document.activeElement).toBe(link);
  });

  it.each([
    { path: metadataPath, status: 403 },
    { path: metadataPath, status: 404 },
    { path: filePath, status: 403 },
    { path: filePath, status: 500 },
  ])('shows an unavailable attachment when $path returns $status', async ({ path, status }) => {
    const adapter = createAdapter({
      [path]: () => Response.json({ message: 'Private server details' }, { status }),
    });

    render(
      <ChatProvider adapter={adapter}>
        <MessagePart part={reference} />
      </ChatProvider>,
    );

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Attachment unavailable: claimed.txt',
    );
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText('Private server details')).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(String(adapter.fetch.mock.calls.at(-1)?.[0])).toBe(`${apiBase}${path}`);
  });

  it('does not request an attachment without a chat provider', () => {
    render(<MessagePart part={reference} />);

    expect(screen.getByRole('alert').textContent).toBe('Attachment unavailable: claimed.txt');
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('aborts an old reference and ignores its late metadata when the message changes', async () => {
    const metadata = deferred<Response>();
    const adapter = createAdapter({
      [metadataPath]: () => metadata.promise,
      [`/${assetsSlug}/asset-2?depth=0`]: () =>
        Response.json({ id: 'asset-2', filename: 'chart one.png', mimeType: 'image/png' }),
    });

    const { rerender } = render(
      <ChatProvider adapter={adapter}>
        <MessagePart part={reference} />
      </ChatProvider>,
    );

    await waitFor(() =>
      expect(adapter.fetch.mock.calls.some(([url]) => String(url).endsWith(metadataPath))).toBe(
        true,
      ),
    );

    const signal = adapter.fetch.mock.calls.find(([url]) => String(url).endsWith(metadataPath))?.[1]
      ?.signal;

    rerender(
      <ChatProvider adapter={adapter}>
        <MessagePart part={{ ...reference, id: 'asset-2' }} />
      </ChatProvider>,
    );

    await screen.findByRole('img', { name: 'chart one.png' });

    expect(signal?.aborted).toBe(true);

    await act(async () => {
      metadata.resolve(
        Response.json({ id: 'asset-1', filename: 'stale.png', mimeType: 'image/png' }),
      );
    });

    expect(screen.getByRole('img').getAttribute('alt')).toBe('chart one.png');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(adapter.fetch.mock.calls.some(([url]) => String(url).includes('stale.png'))).toBe(false);
  });

  it('aborts pending bytes without creating an object URL after unmount', async () => {
    const bytes = deferred<Response>();
    const adapter = createAdapter({ [filePath]: () => bytes.promise });

    const { unmount } = render(
      <ChatProvider adapter={adapter}>
        <MessagePart part={reference} />
      </ChatProvider>,
    );

    await waitFor(() =>
      expect(adapter.fetch.mock.calls.some(([url]) => String(url).endsWith(filePath))).toBe(true),
    );

    const signal = adapter.fetch.mock.calls.find(([url]) => String(url).endsWith(filePath))?.[1]
      ?.signal;

    unmount();

    expect(signal?.aborted).toBe(true);

    await act(async () => {
      bytes.resolve(new Response('late bytes'));
    });

    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
