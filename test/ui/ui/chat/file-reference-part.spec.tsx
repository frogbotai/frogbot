import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MessagePart } from '../../../../packages/ui/src/chat/message-part';
import { ChatProvider } from '../../../../packages/ui/src/chat/provider';

const apiBase = 'https://frogbot.example/custom-api';
const assetsSlug = 'private-assets';
const metadataPath = `/${assetsSlug}/asset-1?depth=0`;
const filePath = `/${assetsSlug}/file/chart%20one.png`;
const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const largeHint =
  'Large file (11.2 MB). In long chats, older files may be left out to keep requests small.';

const reference = {
  type: 'file-reference',
  id: 'asset-1',
  filename: 'claimed.txt',
  mediaType: 'text/plain',
};

function settle(resolve: () => void): Promise<void> {
  return act(() => {
    resolve();

    return Promise.resolve();
  });
}

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
    reader.onerror = () => reject(reader.error ?? new Error('The blob could not be read.'));
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

  return {
    apiBase,
    fetch,
    headers: () => Promise.resolve({ Authorization: 'Bearer private-session' }),
  };
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

    await settle(() => {
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
        Response.json({ id: 'asset-1', filename: 'report.pdf', mimeType: 'application/pdf' }),
      [`/${assetsSlug}/file/report.pdf`]: () =>
        new Response('%PDF-1.7', { headers: { 'content-type': 'application/pdf' } }),
    });

    render(
      <ChatProvider adapter={adapter}>
        <MessagePart part={reference} />
      </ChatProvider>,
    );

    const link = await screen.findByRole('link', { name: 'report.pdf' });

    expect(link.getAttribute('href')).toBe('blob:chat-asset');
    expect(link.getAttribute('download')).toBe('report.pdf');
    expect(link.className).toBe('fb-file-part fb-file-part--download');
    expect(await readBlob(createObjectURL.mock.calls[0][0])).toBe('%PDF-1.7');
    expect(screen.queryByText('Large file')).toBeNull();

    link.focus();

    expect(document.activeElement).toBe(link);
  });

  it('renders a text asset as a text card under the name in the message', async () => {
    const user = userEvent.setup();
    const adapter = createAdapter({
      [metadataPath]: () =>
        Response.json({ id: 'asset-1', filename: 'app.js.txt', mimeType: 'text/plain' }),
      [`/${assetsSlug}/file/app.js.txt`]: () =>
        new Response("console.log('hi');", { headers: { 'content-type': 'text/plain' } }),
    });

    render(
      <ChatProvider adapter={adapter}>
        <MessagePart part={{ ...reference, filename: 'app.js' }} />
      </ChatProvider>,
    );

    const card = await screen.findByRole('group', { name: 'app.js, JS, ready' });

    expect(card.dataset.state).toBe('text');
    expect(card.querySelector('.fb-attachment-card__snippet')?.textContent).toBe(
      "console.log('hi');",
    );
    expect(createObjectURL).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Open app.js' }));

    expect(screen.getByRole('dialog', { name: 'app.js' }).querySelector('pre')?.textContent).toBe(
      "console.log('hi');",
    );
  });

  it('renders a Word asset as a text card from its stored text, without downloading the file', async () => {
    const user = userEvent.setup();
    const text = '# Quarterly report\n\nIntro paragraph.';
    const adapter = createAdapter({
      [metadataPath]: () =>
        Response.json({ id: 'asset-1', filename: 'report.docx', mimeType: docxType, text }),
    });

    render(
      <ChatProvider adapter={adapter}>
        <MessagePart part={{ ...reference, filename: 'report.docx', mediaType: docxType }} />
      </ChatProvider>,
    );

    const card = await screen.findByRole('group', { name: 'report.docx, DOCX, ready' });

    expect(card.dataset.state).toBe('text');
    expect(card.querySelector('.fb-attachment-card__snippet')?.textContent).toBe(text);
    expect(adapter.fetch.mock.calls.some(([url]) => String(url).includes('/file/'))).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Open report.docx' }));

    expect(
      screen.getByRole('dialog', { name: 'report.docx' }).querySelector('pre')?.textContent,
    ).toBe(text);
  });

  it('labels a Word asset with no extension DOCX', async () => {
    const adapter = createAdapter({
      [metadataPath]: () =>
        Response.json({ id: 'asset-1', filename: 'report', mimeType: docxType, text: '# Report' }),
    });

    render(
      <ChatProvider adapter={adapter}>
        <MessagePart part={{ ...reference, filename: 'report', mediaType: docxType }} />
      </ChatProvider>,
    );

    expect(await screen.findByRole('group', { name: 'report, DOCX, ready' })).toBeTruthy();
  });

  it('shows no large-file hint on a Word asset over 10 MB, since only its text is sent', async () => {
    const adapter = createAdapter({
      [metadataPath]: () =>
        Response.json({
          id: 'asset-1',
          filename: 'report.docx',
          mimeType: docxType,
          filesize: 11_200_000,
          text: '# Report',
        }),
    });

    render(
      <ChatProvider adapter={adapter}>
        <MessagePart part={{ ...reference, filename: 'report.docx', mediaType: docxType }} />
      </ChatProvider>,
    );

    const card = await screen.findByRole('group', { name: 'report.docx, DOCX, ready' });

    expect(card.className).not.toContain('fb-attachment-card--large');
    expect(card.getAttribute('aria-describedby')).toBeNull();
    expect(screen.queryByText('Large file')).toBeNull();
  });

  it('shows a Word asset stored without text as a download link', async () => {
    const adapter = createAdapter({
      [metadataPath]: () =>
        Response.json({ id: 'asset-1', filename: 'report.docx', mimeType: docxType, text: null }),
      [`/${assetsSlug}/file/report.docx`]: () =>
        new Response(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]), {
          headers: { 'content-type': docxType },
        }),
    });

    render(
      <ChatProvider adapter={adapter}>
        <MessagePart part={{ ...reference, filename: 'report.docx', mediaType: docxType }} />
      </ChatProvider>,
    );

    const link = await screen.findByRole('link', { name: 'report.docx' });

    expect(link.getAttribute('href')).toBe('blob:chat-asset');
    expect(screen.queryByTestId('attachment-card')).toBeNull();
  });

  it('labels a pasted text asset PASTED', async () => {
    const adapter = createAdapter({
      [metadataPath]: () =>
        Response.json({ id: 'asset-1', filename: 'pasted-1.txt', mimeType: 'text/plain' }),
      [`/${assetsSlug}/file/pasted-1.txt`]: () => new Response('Long pasted text'),
    });

    render(
      <ChatProvider adapter={adapter}>
        <MessagePart part={{ ...reference, filename: 'Pasted text', origin: 'paste' }} />
      </ChatProvider>,
    );

    expect(await screen.findByRole('group', { name: 'Pasted text, PASTED, ready' })).toBeTruthy();
  });

  it('shows the large-file hint on a text card over 10 MB', async () => {
    const adapter = createAdapter({
      [metadataPath]: () =>
        Response.json({
          id: 'asset-1',
          filename: 'notes.md',
          mimeType: 'text/markdown',
          filesize: 11_200_000,
        }),
      [`/${assetsSlug}/file/notes.md`]: () => new Response('# Notes'),
    });

    render(
      <ChatProvider adapter={adapter}>
        <MessagePart part={{ ...reference, filename: 'notes.md' }} />
      </ChatProvider>,
    );

    const card = await screen.findByRole('group', { name: 'notes.md, MD, ready' });

    expect(card.className).toContain('fb-attachment-card--large');
    expect(document.getElementById(card.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      largeHint,
    );
  });

  it.each([
    { filesize: 11_200_000, large: true },
    { filesize: 9_000_000, large: false },
  ])(
    'shows the large-file hint on an image of $filesize bytes: $large',
    async ({ filesize, large }) => {
      const adapter = createAdapter({
        [metadataPath]: () =>
          Response.json({
            id: 'asset-1',
            filename: 'chart one.png',
            mimeType: 'image/png',
            filesize,
          }),
      });

      render(
        <ChatProvider adapter={adapter}>
          <MessagePart part={reference} />
        </ChatProvider>,
      );

      await screen.findByRole('img', { name: 'chart one.png' });

      expect(Boolean(screen.queryByText('Large file'))).toBe(large);
      expect(Boolean(screen.queryByText(largeHint))).toBe(large);
    },
  );

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

    await settle(() => {
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

    await settle(() => {
      bytes.resolve(new Response('late bytes'));
    });

    expect(createObjectURL).not.toHaveBeenCalled();
  });
});
