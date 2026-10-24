import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Composer, type ComposerProps } from '../../../../packages/ui/src/chat/composer/composer';
import type {
  ComposerCommand,
  MentionSource,
} from '../../../../packages/ui/src/chat/composer/context';
import {
  type ComposerHistoryStorage,
  HISTORY_LIMIT,
} from '../../../../packages/ui/src/chat/composer/history';
import type { ComposerPrompt } from '../../../../packages/ui/src/chat/composer/prompt';
import { ChatProvider } from '../../../../packages/ui/src/chat/provider';
import { createRestChatAdapter } from '../../../../packages/ui/src/chat/rest/adapter';
import {
  composerInput,
  composerPrompt,
  composerText,
  insertMention,
  paste,
  press,
  type,
} from './composerEditor';

const emptyPrompt = { text: '', mentions: [] };

const prompt = (text: string) => ({ text, mentions: [] });

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function settle(resolve: () => void): Promise<void> {
  return act(() => {
    resolve();

    return Promise.resolve();
  });
}

function uploadServer() {
  const files: File[] = [];
  const texts = new Map<string, string>();

  const fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const file = (init?.body as FormData).get('file') as File;

    files.push(file);

    return Promise.resolve(
      Response.json({
        doc: {
          id: `asset-${files.length}`,
          filename: file.name,
          mimeType: file.type,
          text: texts.get(file.name) ?? null,
        },
        message: 'Document successfully created.',
      }),
    );
  });

  return { fetch, files, texts };
}

function fileRefusal(name: string) {
  return Response.json(
    {
      errors: [
        {
          name: 'g',
          message: 'The following field is invalid: file',
          data: {
            collection: 'assets',
            errors: [
              { path: 'file', message: `${name} couldn't be read: it is password-protected.` },
            ],
          },
        },
      ],
    },
    { status: 400 },
  );
}

function renderComposer(props: Partial<ComposerProps> = {}) {
  const server = uploadServer();
  const onSubmit = vi.fn();
  const adapter = createRestChatAdapter({ fetch: server.fetch, assetsSlug: 'assets' });

  const element = (next: Partial<ComposerProps>) => (
    <Composer
      adapter={adapter}
      onSubmit={onSubmit}
      submitContent="Send"
      stopContent="Stop"
      {...next}
    />
  );

  const view = render(element(props));

  const drop = (...files: File[]) =>
    fireEvent.drop(view.container.querySelector('form') as HTMLFormElement, {
      dataTransfer: { files },
    });

  const update = (next: Partial<ComposerProps>) => view.rerender(element({ ...props, ...next }));

  return { ...view, drop, onSubmit, server, update };
}

function binary(name: string, type: string) {
  return new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])], name, { type });
}

function png(name: string) {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], name, {
    type: 'image/png',
  });
}

function clipboard({ files = [], text }: { files?: File[]; text?: string }) {
  return {
    files: files as unknown as FileList,
    types: [...(text === undefined ? [] : ['text/plain']), ...(files.length ? ['Files'] : [])],
    getData: (type: string) => (type === 'text/plain' ? (text ?? '') : ''),
  };
}

function pdf(name: string) {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, { type: 'application/pdf' });
}

function description(element: HTMLElement) {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ');
}

function status() {
  return document.querySelector('.fb-attachments__status')?.textContent;
}

describe('Composer', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = vi.fn(() => 'blob:preview');
        static revokeObjectURL = vi.fn();
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits with Enter, preserves Shift+Enter, and renders slots', async () => {
    const onSubmit = vi.fn();

    render(
      <Composer
        onSubmit={onSubmit}
        startSlot={<span>start</span>}
        endSlot={<span>end</span>}
        submitContent="Send"
        stopContent="Stop"
      />,
    );

    const input = composerInput();

    expect(input.className).toBe('fb-composer__input');
    expect(input.getAttribute('aria-multiline')).toBe('true');

    type('Hello');
    press('Enter', { shiftKey: true });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(composerText()).toBe('Hello');

    press('Enter');

    expect(onSubmit).toHaveBeenCalledWith({ text: 'Hello', mentions: [] }, []);

    await waitFor(() => expect(composerText()).toBe(''));

    expect(screen.getByText('start')).toBeTruthy();
    expect(screen.getByText('end')).toBeTruthy();
  });

  it('renders no tab-context control without an end slot', () => {
    render(
      <Composer endSlot={undefined} onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" />,
    );

    expect(screen.queryByRole('button', { name: 'Add tab context' })).toBeNull();
  });

  it('stops while pending', () => {
    const onStop = vi.fn();

    render(
      <Composer
        pending
        onStop={onStop}
        onSubmit={vi.fn()}
        submitContent="Send"
        stopContent="Stop"
      />,
    );

    fireEvent.click(screen.getByText('Stop'));

    expect(onStop).toHaveBeenCalledOnce();
  });

  it('starts from a default value and labels an empty input with its placeholder', () => {
    const { rerender } = render(
      <Composer
        aria-label="Ask"
        defaultValue="Draft"
        placeholder="Ask anything"
        onSubmit={vi.fn()}
        submitContent="Send"
        stopContent="Stop"
      />,
    );

    expect(composerText(composerInput('Ask'))).toBe('Draft');
    expect(screen.queryByText('Ask anything')).toBeNull();

    rerender(
      <Composer
        key="empty"
        placeholder="Ask anything"
        onSubmit={vi.fn()}
        submitContent="Send"
        stopContent="Stop"
      />,
    );

    expect(screen.getByText('Ask anything').className).toBe('fb-composer-editor__placeholder');
    expect(composerInput().getAttribute('aria-placeholder')).toBe('Ask anything');
  });

  it('shows drag and disabled states without accepting files', () => {
    const { container, rerender } = render(
      <Composer onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" />,
    );

    const form = container.querySelector('form') as HTMLFormElement;
    fireEvent.dragEnter(form);

    expect(container.querySelector('.fb-composer__gradient')?.classList).toContain(
      'fb-composer__gradient--dragging',
    );

    fireEvent.drop(form, { dataTransfer: { files: [new File(['x'], 'x.txt')] } });

    expect(container.querySelector('.fb-composer__gradient')?.classList).not.toContain(
      'fb-composer__gradient--dragging',
    );
    expect(screen.queryByTestId('attachment-card')).toBeNull();

    rerender(
      <Composer
        disabled
        defaultValue="Hello"
        onSubmit={vi.fn()}
        submitContent="Send"
        stopContent="Stop"
      />,
    );

    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect(composerInput().getAttribute('contenteditable')).toBe('false');
    expect(composerInput().getAttribute('aria-readonly')).toBe('true');
  });

  it('limits the file picker to text and the media the model reads', () => {
    const { container, update } = renderComposer({ modelInputs: ['text', 'image'] });

    const accept = () =>
      container.querySelector('input[type="file"]')?.getAttribute('accept') ?? '';

    expect(accept().split(',')).toEqual(
      expect.arrayContaining(['text/*', '.md', '.docx', '.xlsx', 'image/png']),
    );
    expect(accept()).not.toContain('application/pdf');
    expect(accept()).not.toContain('audio/*');

    update({ modelInputs: undefined });

    expect(accept().split(',')).toEqual(
      expect.arrayContaining(['image/png', 'application/pdf', 'audio/*', 'video/*']),
    );
  });

  it('uploads a dropped PDF and submits a stable reference', async () => {
    const { drop, onSubmit, server } = renderComposer();

    drop(pdf('report.pdf'));

    expect(await screen.findByRole('group', { name: 'report.pdf, PDF, ready' })).toBeTruthy();
    expect(server.fetch.mock.calls[0]?.[0]).toBe('/api/assets');
    expect(status()).toBe('report.pdf attached');

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith(emptyPrompt, [
      { id: 'asset-1', filename: 'report.pdf', mediaType: 'application/pdf' },
    ]);
    expect(JSON.stringify(onSubmit.mock.calls)).not.toContain('base64');
  });

  it('never uploads unsupported files or media the model cannot read', async () => {
    const { drop, server } = renderComposer({ modelInputs: ['text'], modelName: 'Text Reader' });

    drop(binary('report.zip', 'application/zip'), png('photo.png'));

    const zip = await screen.findByRole('group', { name: "report.zip, ZIP, won't be sent" });
    const photo = screen.getByRole('group', { name: "photo.png, PNG, won't be sent" });

    expect(zip.dataset.state).toBe('refused');
    expect(description(zip)).toBe("Won't be sent. This file type isn't supported.");
    expect(description(photo)).toBe("Won't be sent. Text Reader can't read images.");
    expect(status()).toBe(
      "report.zip won't be sent: this file type isn't supported. photo.png won't be sent: Text Reader can't read images",
    );
    expect(server.fetch).not.toHaveBeenCalled();
  });

  it('uploads a code file as plain text under its real name', async () => {
    const { drop, onSubmit, server } = renderComposer();

    drop(new File(["console.log('hi');"], 'app.js', { type: 'text/javascript' }));

    const card = await screen.findByRole('group', { name: 'app.js, JS, ready' });

    expect(card.dataset.state).toBe('text');
    expect(screen.getByRole('button', { name: 'Open app.js' })).toBeTruthy();
    expect(status()).toBe('app.js attached as text');
    expect(server.files.map(({ name, type }: File) => ({ name, type }))).toEqual([
      { name: 'app.js.txt', type: 'text/plain' },
    ]);
    expect(await server.files[0]?.text()).toBe("console.log('hi');");

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith(emptyPrompt, [
      { id: 'asset-1', filename: 'app.js', mediaType: 'text/plain' },
    ]);
  });

  it('uploads a long paste as a text asset marked as pasted', async () => {
    const { onSubmit, server } = renderComposer();
    const text = 'p'.repeat(651);

    paste({ getData: () => text });

    expect(screen.getByRole('group', { name: 'Pasted text, PASTED, uploading' })).toBeTruthy();
    expect(await screen.findByRole('group', { name: 'Pasted text, PASTED, ready' })).toBeTruthy();
    expect(server.files[0]?.name).toMatch(/^pasted-\d+\.txt$/);
    expect(await server.files[0]?.text()).toBe(text);
    expect(status()).toBe('Pasted text attached');

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith(emptyPrompt, [
      { id: 'asset-1', filename: 'Pasted text', mediaType: 'text/plain', origin: 'paste' },
    ]);
  });

  it('keeps 650 characters in the input and keeps a longer paste inline without storage', () => {
    const onSubmit = vi.fn();

    render(<Composer onSubmit={onSubmit} submitContent="Send" stopContent="Stop" />);

    expect(paste({ getData: () => 'a'.repeat(650), types: ['text/plain'] })).toBe(true);
    expect(screen.queryByTestId('attachment-card')).toBeNull();
    expect(paste({ getData: () => 'b'.repeat(651) })).toBe(false);
    expect(composerText()).toBe('');
    expect(screen.getByRole('group', { name: 'Pasted text, PASTED, ready' }).dataset.state).toBe(
      'text',
    );
    expect(screen.queryByRole('button', { name: 'Add files' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith(emptyPrompt, [
      {
        type: 'paste',
        text: 'b'.repeat(651),
        filename: expect.stringMatching(/^pasted-\d+\.txt$/),
      },
    ]);
  });

  it('hides the file picker and ignores drops when the adapter cannot upload', () => {
    const { uploadAttachment: _upload, ...adapter } = createRestChatAdapter({
      fetch: vi.fn(),
      assetsSlug: 'assets',
    });

    const { container } = render(
      <Composer adapter={adapter} onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" />,
    );

    fireEvent.drop(container.querySelector('form') as HTMLFormElement, {
      dataTransfer: { files: [new File(['notes'], 'notes.txt', { type: 'text/plain' })] },
    });

    expect(screen.queryByRole('button', { name: 'Add files' })).toBeNull();
    expect(screen.queryByRole('listitem')).toBeNull();
  });

  it('uploads a Word document as itself and previews the text the server read', async () => {
    const { drop, onSubmit, server } = renderComposer({ modelInputs: ['text'] });
    const upload = deferred<Response>();
    const file = binary('report.docx', DOCX_TYPE);
    const read = vi.spyOn(file, 'text');
    const slice = vi.spyOn(file, 'slice');

    server.fetch.mockImplementationOnce(() => upload.promise);

    drop(file);

    const card = await screen.findByRole('group', { name: 'report.docx, DOCX, uploading' });

    await settle(() => {
      upload.resolve(
        Response.json({
          doc: { id: 'asset-1', filename: 'report.docx', mimeType: DOCX_TYPE, text: '# Report' },
        }),
      );
    });

    const sent = (server.fetch.mock.calls[0]?.[1]?.body as FormData).get('file') as File;

    expect(card.dataset.state).toBe('text');
    expect(card.getAttribute('aria-label')).toBe('report.docx, DOCX, ready');
    expect(card.querySelector('.fb-attachment-card__snippet')?.textContent).toBe('# Report');
    expect(status()).toBe('report.docx attached as text');
    expect({ name: sent.name, type: sent.type }).toEqual({ name: 'report.docx', type: DOCX_TYPE });
    expect(read).not.toHaveBeenCalled();
    expect(slice).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith(emptyPrompt, [
      { id: 'asset-1', filename: 'report.docx', mediaType: DOCX_TYPE },
    ]);
  });

  it('opens the text the server read from a workbook, with its note about rows left out', async () => {
    const user = userEvent.setup();
    const { drop, server } = renderComposer();
    const text =
      'Sheet "Export":\nid\n1\n[export.xlsx: showing the first 1,000 of 1,001 rows of sheet Export]';

    server.texts.set('export.xlsx', text);

    drop(binary('export.xlsx', XLSX_TYPE));

    await screen.findByRole('group', { name: 'export.xlsx, XLSX, ready' });
    await user.click(screen.getByRole('button', { name: 'Open export.xlsx' }));

    const dialog = await screen.findByRole('dialog', { name: 'export.xlsx' });

    expect(dialog.querySelector('pre')?.textContent).toBe(text);
  });

  it.each([
    { name: 'report', type: DOCX_TYPE, label: 'DOCX' },
    { name: 'budget', type: XLSX_TYPE, label: 'XLSX' },
  ])('labels $name, a $label file with no extension, $label', async ({ name, type, label }) => {
    const { drop, server } = renderComposer();

    server.texts.set(name, '# Read');

    drop(binary(name, type));

    expect(await screen.findByRole('group', { name: `${name}, ${label}, ready` })).toBeTruthy();
  });

  it('shows the large-file hint on a large text file but not on a large Word document', async () => {
    const { drop, server } = renderComposer();
    const notes = new File(['# Notes'], 'notes.md', { type: 'text/markdown' });
    const report = binary('report.docx', DOCX_TYPE);

    Object.defineProperty(notes, 'size', { value: 11_200_000 });
    Object.defineProperty(report, 'size', { value: 11_200_000 });
    server.texts.set('report.docx', '# Report');

    drop(notes, report);

    const text = await screen.findByRole('group', { name: 'notes.md, MD, ready' });
    const word = await screen.findByRole('group', { name: 'report.docx, DOCX, ready' });

    expect(text.className).toContain('fb-attachment-card--large');
    expect(description(text)).toBe(
      'Large file (11.2 MB). In long chats, older files may be left out to keep requests small.',
    );
    expect(word.className).not.toContain('fb-attachment-card--large');
    expect(word.getAttribute('aria-describedby')).toBeNull();
    expect(within(word).queryByText('Large file')).toBeNull();
  });

  it('shows a Word document the server refuses as red, without Retry, when the error name is minified', async () => {
    const { drop, onSubmit, server } = renderComposer();

    server.fetch.mockImplementationOnce(() => Promise.resolve(fileRefusal('report.docx')));

    drop(binary('report.docx', DOCX_TYPE));

    const card = await screen.findByRole('group', { name: "report.docx, DOCX, won't be sent" });

    expect(card.dataset.state).toBe('refused');
    expect(description(card)).toBe("Won't be sent. This file couldn't be read.");
    expect(within(card).queryByRole('button', { name: /Retry/ })).toBeNull();
    expect(status()).toBe("report.docx won't be sent: this file couldn't be read");

    type('Summarise it');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith(prompt('Summarise it'), []);
    expect(server.fetch).toHaveBeenCalledOnce();
  });

  it('offers Retry when a Word document fails to upload for another reason', async () => {
    const { drop, server } = renderComposer();

    server.texts.set('report.docx', '# Report');

    server.fetch.mockImplementationOnce(() =>
      Promise.resolve(
        Response.json({ errors: [{ message: 'Storage is unavailable.' }] }, { status: 500 }),
      ),
    );

    drop(binary('report.docx', DOCX_TYPE));

    const card = await screen.findByRole('group', { name: 'report.docx, DOCX, upload failed' });

    expect(description(card)).toBe('Upload failed. Storage is unavailable.');

    fireEvent.click(screen.getByRole('button', { name: 'Retry uploading report.docx' }));

    expect(await screen.findByRole('group', { name: 'report.docx, DOCX, ready' })).toBeTruthy();
    expect(server.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: 'slides.pptx',
      type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    },
    { name: 'old.doc', type: 'application/msword' },
    { name: 'old.xls', type: 'application/vnd.ms-excel' },
    { name: 'notes.odt', type: 'application/vnd.oasis.opendocument.text' },
    { name: 'macros.docm', type: 'application/vnd.ms-word.document.macroEnabled.12' },
  ])('never uploads $name, an office file FrogBot does not read', async ({ name, type }) => {
    const { drop, server } = renderComposer();

    const extension = name.slice(name.lastIndexOf('.') + 1).toUpperCase();

    drop(binary(name, type));

    const card = await screen.findByRole('group', {
      name: `${name}, ${extension}, won't be sent`,
    });

    expect(description(card)).toBe("Won't be sent. This file type isn't supported.");
    expect(status()).toBe(`${name} won't be sent: this file type isn't supported`);
    expect(server.fetch).not.toHaveBeenCalled();
  });

  it('retries a failed upload', async () => {
    const { drop, onSubmit, server } = renderComposer();

    server.fetch.mockImplementationOnce(() =>
      Promise.resolve(
        Response.json({ errors: [{ message: 'Storage is unavailable.' }] }, { status: 500 }),
      ),
    );

    drop(new File(['retry'], 'retry.txt', { type: 'text/plain' }));

    const card = await screen.findByRole('group', { name: 'retry.txt, TXT, upload failed' });

    expect(description(card)).toBe('Upload failed. Storage is unavailable.');
    expect(status()).toBe('Upload failed: retry.txt');

    fireEvent.click(screen.getByRole('button', { name: 'Retry uploading retry.txt' }));

    expect(await screen.findByRole('group', { name: 'retry.txt, TXT, ready' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(server.fetch).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenCalledWith(emptyPrompt, [
      { id: 'asset-1', filename: 'retry.txt', mediaType: 'text/plain' },
    ]);
  });

  it('shows a file over the upload limit as too large, without Retry', async () => {
    const { drop, server } = renderComposer();

    server.fetch.mockImplementationOnce(() =>
      Promise.resolve(
        Response.json(
          { errors: [{ message: 'File size limit has been reached' }] },
          { status: 413 },
        ),
      ),
    );

    drop(binary('big.mov', 'video/quicktime'));

    const card = await screen.findByRole('group', { name: 'big.mov, MOV, too large to upload' });

    expect(card.dataset.state).toBe('too-large');
    expect(description(card)).toBe(
      'Too large to upload. This file is larger than this app allows.',
    );
    expect(within(card).queryByRole('button', { name: /Retry/ })).toBeNull();
    expect(status()).toBe('Too large to upload: big.mov');
  });

  it('sends only the good files while red cards show, then clears every card', async () => {
    const { drop, onSubmit, server } = renderComposer({ modelInputs: ['text'] });

    drop(new File(['# Notes'], 'notes.md', { type: 'text/markdown' }), binary('report.zip', ''));

    await screen.findByRole('group', { name: 'notes.md, MD, ready' });

    type('Here');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith(prompt('Here'), [
      { id: 'asset-1', filename: 'notes.md', mediaType: 'text/markdown' },
    ]);

    await waitFor(() => expect(screen.queryByTestId('attachment-card')).toBeNull());

    expect(server.fetch).toHaveBeenCalledOnce();
  });

  it('hides Send when only red cards remain and there is no text', async () => {
    const { drop } = renderComposer();

    drop(binary('report.zip', 'application/zip'));

    await screen.findByRole('group', { name: "report.zip, ZIP, won't be sent" });

    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
  });

  it('leaves every card as it was when the model changes', async () => {
    const { drop, onSubmit, update } = renderComposer({
      modelInputs: ['text', 'image'],
      modelName: 'Vision',
    });

    drop(
      png('photo.png'),
      new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'scan.pdf', {
        type: 'application/pdf',
      }),
    );

    const photo = await screen.findByRole('group', { name: 'photo.png, ready' });
    const scan = screen.getByRole('group', { name: "scan.pdf, PDF, won't be sent" });

    update({ modelInputs: ['text', 'pdf'], modelName: 'Reader' });

    expect(within(photo).getByRole('img', { name: 'photo.png' }).getAttribute('src')).toBe(
      'blob:preview',
    );
    expect(photo.dataset.state).toBe('ready');
    expect(scan.dataset.state).toBe('refused');
    expect(description(scan)).toBe("Won't be sent. Vision can't read PDFs.");

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith(emptyPrompt, [
      { id: 'asset-1', filename: 'photo.png', mediaType: 'image/png' },
    ]);
  });

  it('waits for an upload before Send and forgets a file removed while uploading', async () => {
    const { drop, onSubmit, server } = renderComposer();
    const upload = deferred<Response>();

    server.fetch.mockImplementationOnce(() => upload.promise);

    type('Hi');
    drop(new File(['notes'], 'notes.txt', { type: 'text/plain' }));

    await screen.findByRole('group', { name: 'notes.txt, TXT, uploading' });

    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Remove notes.txt' }));

    expect(status()).toBe('notes.txt removed');

    await settle(() => {
      upload.resolve(
        Response.json({ doc: { id: 'late', filename: 'notes.txt', mimeType: 'text/plain' } }),
      );
    });

    expect(screen.queryByTestId('attachment-card')).toBeNull();
    expect(status()).toBe('notes.txt removed');

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith(prompt('Hi'), []);
  });

  it('sends once when Enter is pressed twice before the submit settles', async () => {
    const submitted = deferred<void>();
    const { drop, onSubmit } = renderComposer();

    onSubmit.mockReturnValue(submitted.promise);
    drop(pdf('report.pdf'));

    await screen.findByRole('group', { name: 'report.pdf, PDF, ready' });

    press('Enter');
    press('Enter');

    expect(onSubmit).toHaveBeenCalledOnce();

    await settle(() => submitted.resolve());

    expect(screen.queryByTestId('attachment-card')).toBeNull();
  });

  it('turns every pasted file into an attachment and drops the clipboard text with it', async () => {
    const { onSubmit } = renderComposer();

    expect(paste(clipboard({ files: [png('shot.png')] }))).toBe(false);
    expect(await screen.findByRole('group', { name: 'shot.png, ready' })).toBeTruthy();

    expect(paste(clipboard({ files: [png('page.png')], text: 'Copied caption' }))).toBe(false);
    expect(await screen.findByRole('group', { name: 'page.png, ready' })).toBeTruthy();
    expect(composerText()).toBe('');

    expect(paste(clipboard({ text: 'Just text' }))).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith(emptyPrompt, [
      { id: 'asset-1', filename: 'shot.png', mediaType: 'image/png' },
      { id: 'asset-2', filename: 'page.png', mediaType: 'image/png' },
    ]);
  });

  it('leaves a pasted file to the editor when the adapter cannot upload', () => {
    render(<Composer onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" />);

    expect(paste(clipboard({ files: [png('shot.png')], text: 'Copied caption' }))).toBe(true);
    expect(screen.queryByTestId('attachment-card')).toBeNull();
  });

  it('stops a pending turn with Escape or Ctrl+G, and does nothing otherwise', () => {
    const onStop = vi.fn();

    const { rerender } = render(
      <Composer
        pending
        onStop={onStop}
        onSubmit={vi.fn()}
        submitContent="Send"
        stopContent="Stop"
      />,
    );

    press('Escape');
    press('g', { ctrlKey: true });

    expect(onStop).toHaveBeenCalledTimes(2);

    rerender(
      <Composer onStop={onStop} onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" />,
    );

    press('Escape');

    expect(onStop).toHaveBeenCalledTimes(2);
  });

  it('runs onBeforeSubmit mid-turn and sends nothing when it handles the prompt', async () => {
    const onSubmit = vi.fn();
    const onBeforeSubmit = vi.fn(() => Promise.resolve(true));

    render(
      <Composer
        pending
        onBeforeSubmit={onBeforeSubmit}
        onSubmit={onSubmit}
        submitContent="Send"
        stopContent="Stop"
      />,
    );

    type('/model sonnet');
    press('Enter');

    await waitFor(() => expect(composerText()).toBe(''));

    expect(onBeforeSubmit).toHaveBeenCalledWith({
      text: '/model sonnet',
      mentions: [],
      attachments: [],
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('keeps the text when onBeforeSubmit declines mid-turn, and reports a rejection', async () => {
    const onError = vi.fn();
    const onSubmit = vi.fn();
    const onBeforeSubmit = vi.fn<() => Promise<boolean>>(() => Promise.resolve(false));

    render(
      <Composer
        pending
        onBeforeSubmit={onBeforeSubmit}
        onError={onError}
        onSubmit={onSubmit}
        submitContent="Send"
        stopContent="Stop"
      />,
    );

    type('Later');
    press('Enter');

    await waitFor(() => expect(onBeforeSubmit).toHaveBeenCalledOnce());

    expect(onSubmit).not.toHaveBeenCalled();
    expect(composerText()).toBe('Later');

    onBeforeSubmit.mockRejectedValueOnce(new Error('Unknown command'));
    press('Enter');

    await waitFor(() => expect(onError).toHaveBeenCalledWith(new Error('Unknown command')));

    expect(composerText()).toBe('Later');
  });

  describe('history', () => {
    function memoryHistory(texts: string[]) {
      const storage = {
        load: vi.fn<ComposerHistoryStorage['load']>(() => texts.map(prompt)),
        save: vi.fn<ComposerHistoryStorage['save']>(),
      };

      return storage;
    }

    async function renderWithHistory(storage: ComposerHistoryStorage) {
      const onSubmit = vi.fn();
      const adapter = createRestChatAdapter({
        fetch: vi.fn(() => new Promise<Response>(() => {})),
      });

      render(
        <ChatProvider adapter={adapter} composerHistory={storage}>
          <Composer onSubmit={onSubmit} submitContent="Send" stopContent="Stop" />
        </ChatProvider>,
      );

      await act(() => Promise.resolve());

      return { onSubmit };
    }

    it('pages through sent prompts from an empty input, newest first', async () => {
      await renderWithHistory(memoryHistory(['second', 'first']));

      press('ArrowUp');
      await waitFor(() => expect(composerText()).toBe('second'));

      press('ArrowUp');
      await waitFor(() => expect(composerText()).toBe('first'));

      press('ArrowUp');
      press('ArrowDown');
      await waitFor(() => expect(composerText()).toBe('second'));

      press('ArrowDown');
      await waitFor(() => expect(composerText()).toBe(''));

      type('draft');
      press('ArrowUp');
      await act(() => Promise.resolve());

      expect(composerText()).toBe('draft');
    });

    it('saves each sent prompt once, newest first, capped at 100', async () => {
      const storage = memoryHistory(
        Array.from({ length: HISTORY_LIMIT }, (_, index) => `old ${index}`),
      );

      const { onSubmit } = await renderWithHistory(storage);

      type('new');
      press('Enter');
      await waitFor(() => expect(storage.save).toHaveBeenCalledOnce());

      const saved = storage.save.mock.calls[0]?.[0] ?? [];

      expect(saved).toHaveLength(HISTORY_LIMIT);
      expect(saved[0]).toEqual(prompt('new'));
      expect(saved.at(-1)).toEqual(prompt('old 98'));

      await waitFor(() => expect(composerText()).toBe(''));
      type('new');
      press('Enter');
      await act(() => Promise.resolve());

      expect(onSubmit).toHaveBeenCalledTimes(2);
      expect(storage.save).toHaveBeenCalledOnce();
    });

    it('keeps sending when the storage throws', async () => {
      const storage: ComposerHistoryStorage = {
        load: () => {
          throw new Error('denied');
        },
        save: () => Promise.reject(new Error('full')),
      };

      const { onSubmit } = await renderWithHistory(storage);

      press('ArrowUp');
      type('Hello');
      press('Enter');
      await act(() => Promise.resolve());

      expect(onSubmit).toHaveBeenCalledWith(prompt('Hello'), []);
    });

    it('recalls a stored prompt with malformed mentions as its text', async () => {
      await renderWithHistory({
        load: () => [
          {
            text: 'Ask @Docs',
            mentions: [null, { label: 7 }, 'Docs'] as unknown as ComposerPrompt['mentions'],
          },
        ],
        save: vi.fn(),
      });

      press('ArrowUp');

      await waitFor(() => expect(composerText()).toBe('Ask @Docs'));
    });

    it('reads the default localStorage list and ignores unreadable data', async () => {
      window.localStorage.setItem('frogbot:composer-history', '{not json');

      render(<Composer onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" />);
      await act(() => Promise.resolve());

      type('Hello');
      press('Enter');

      await waitFor(() =>
        expect(JSON.parse(window.localStorage.getItem('frogbot:composer-history') ?? '')).toEqual([
          prompt('Hello'),
        ]),
      );

      window.localStorage.clear();
    });
  });

  describe('commands and mentions', () => {
    const pricing = { source: 'pages', id: 'pricing', label: 'Pricing page' };

    function renderWithRegistries({
      commands = [],
      mentionSources = [],
      ...props
    }: Partial<ComposerProps> & {
      commands?: ComposerCommand[];
      mentionSources?: MentionSource[];
    } = {}) {
      const onSubmit = vi.fn();
      const storage = { load: () => [], save: vi.fn() };
      const adapter = createRestChatAdapter({
        fetch: vi.fn(() => new Promise<Response>(() => {})),
      });

      render(
        <ChatProvider
          adapter={adapter}
          commands={commands}
          composerHistory={storage}
          mentionSources={mentionSources}
        >
          <Composer onSubmit={onSubmit} submitContent="Send" stopContent="Stop" {...props} />
        </ChatProvider>,
      );

      return { onSubmit, storage };
    }

    const options = () => screen.queryAllByRole('option').map((option) => option.textContent ?? '');

    it('lists enabled commands matching the typed id or title, and runs a picked one', async () => {
      const clear = vi.fn();
      const model = vi.fn();

      const { onSubmit } = renderWithRegistries({
        commands: [
          { id: 'clear', title: 'Clear chat', execute: clear },
          { id: 'model', title: 'Pick a model', arguments: true, execute: model },
          { id: 'compact', title: 'Compact', disabled: true, execute: vi.fn() },
        ],
      });

      type('/');

      await waitFor(() => expect(options()).toEqual(['/clearClear chat', '/modelPick a model']));

      type('c');

      await waitFor(() => expect(options()).toEqual(['/clearClear chat', '/modelPick a model']));

      type('l');

      await waitFor(() => expect(options()).toEqual(['/clearClear chat']));

      expect(screen.getByRole('listbox', { name: 'Commands' })).toBeTruthy();

      press('Enter');

      await waitFor(() => expect(clear).toHaveBeenCalledWith(''));
      await waitFor(() => expect(composerText()).toBe(''));

      expect(onSubmit).not.toHaveBeenCalled();
      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('writes /id for a command that takes arguments, and moves with Ctrl+N and Ctrl+P', async () => {
      renderWithRegistries({
        commands: [
          { id: 'clear', title: 'Clear chat', execute: vi.fn() },
          { id: 'model', title: 'Pick a model', arguments: true, execute: vi.fn() },
        ],
      });

      type('/');

      await waitFor(() => expect(options()).toHaveLength(2));

      const selected = () =>
        screen.getAllByRole('option').map((option) => option.getAttribute('aria-selected'));

      expect(selected()).toEqual(['true', 'false']);
      expect(composerInput().getAttribute('aria-activedescendant')).toBe(
        screen.getAllByRole('option')[0]?.id,
      );

      press('n', { ctrlKey: true });

      await waitFor(() => expect(selected()).toEqual(['false', 'true']));

      press('p', { ctrlKey: true });
      press('ArrowUp');

      await waitFor(() => expect(selected()).toEqual(['false', 'true']));

      press('Tab');

      await waitFor(() => expect(composerText()).toBe('/model '));

      expect(screen.queryByRole('listbox')).toBeNull();
    });

    it('closes the menu with Escape without stopping the turn', async () => {
      const onStop = vi.fn();

      renderWithRegistries({
        pending: true,
        onStop,
        commands: [{ id: 'clear', title: 'Clear chat', execute: vi.fn() }],
      });

      type('/');
      await screen.findByRole('listbox');
      press('Escape');

      await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());

      expect(onStop).not.toHaveBeenCalled();

      press('Escape');

      expect(onStop).toHaveBeenCalledOnce();
    });

    it('runs /model sonnet mid-turn, sending nothing and keeping attachments and history', async () => {
      const model = vi.fn();
      const onBeforeSubmit = vi.fn(() => false);

      const { onSubmit, storage } = renderWithRegistries({
        pending: true,
        onBeforeSubmit,
        commands: [{ id: 'model', title: 'Pick a model', arguments: true, execute: model }],
      });

      paste({ getData: () => 'p'.repeat(651) });
      type('/model sonnet');
      press('Enter');

      await waitFor(() => expect(model).toHaveBeenCalledWith('sonnet'));
      await waitFor(() => expect(composerText()).toBe(''));

      expect(onBeforeSubmit).not.toHaveBeenCalled();
      expect(onSubmit).not.toHaveBeenCalled();
      expect(storage.save).not.toHaveBeenCalled();
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    });

    it('reports a command that fails through onError', async () => {
      const onError = vi.fn();

      renderWithRegistries({
        onError,
        commands: [
          {
            id: 'model',
            title: 'Pick a model',
            arguments: true,
            execute: () => Promise.reject(new Error('No such model')),
          },
        ],
      });

      type('/model nope');
      press('Enter');

      await waitFor(() => expect(onError).toHaveBeenCalledWith(new Error('No such model')));
    });

    it('sends chips with the offsets of their @label', () => {
      const { onSubmit } = renderWithRegistries();

      type('Ask ');
      insertMention({ ...pricing, data: { url: '/pricing' } });
      type(' about it');

      const sent = {
        text: 'Ask @Pricing page about it',
        mentions: [{ ...pricing, data: { url: '/pricing' }, start: 4, end: 17 }],
      };

      expect(composerPrompt()).toEqual(sent);
      expect(sent.text.slice(4, 17)).toBe('@Pricing page');

      press('Enter');

      expect(onSubmit).toHaveBeenCalledWith(sent, []);
    });

    it('searches every source per keystroke, aborting the last search, grouped by source', async () => {
      const signals: AbortSignal[] = [];

      const source = (id: string, labels: string[]): MentionSource => ({
        id,
        search: (query, { signal }) => {
          signals.push(signal);

          return Promise.resolve(
            labels
              .filter((label) => label.toLowerCase().startsWith(query))
              .map((label) => ({ id: label, label })),
          );
        },
      });

      renderWithRegistries({
        mentionSources: [source('pages', ['Pricing', 'Plans']), source('tabs', ['Preview'])],
      });

      type('Ask @p');

      await waitFor(() => expect(options()).toEqual(['Pricing', 'Plans', 'Preview']));

      type('r');

      await waitFor(() => expect(options()).toEqual(['Pricing', 'Preview']));

      expect(signals.map(({ aborted }) => aborted)).toEqual([true, true, false, false]);
      expect(screen.getAllByRole('group').map((group) => group.getAttribute('aria-label'))).toEqual(
        ['pages', 'tabs'],
      );
      expect(screen.getByRole('listbox', { name: 'Mentions' })).toBeTruthy();
    });
  });

  it('keeps text typed as soon as the editor mounts, before its effects run', async () => {
    function MountLater() {
      const [shown, setShown] = useState(false);

      useEffect(() => {
        const timer = setTimeout(() => setShown(true), 0);

        return () => clearTimeout(timer);
      }, []);

      return shown ? <Composer onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" /> : null;
    }

    const typed = new Promise<void>((resolve) => {
      const observer = new MutationObserver(() => {
        const box = document.querySelector<HTMLElement & { __lexicalEditor?: unknown }>(
          '[role="textbox"]',
        );

        if (!box?.__lexicalEditor) return;

        observer.disconnect();
        type('hello', box);
        resolve();
      });

      observer.observe(document.body, { childList: true, subtree: true });
    });

    render(<MountLater />);
    await typed;

    expect(await screen.findByRole('button', { name: 'Send' })).toBeTruthy();
  });
});

describe('Composer send hand-off', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = vi.fn(() => 'blob:preview');
        static revokeObjectURL = vi.fn();
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function pendingSend() {
    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((done, fail) => {
      resolve = done;
      reject = fail;
    });

    return { onSubmit: vi.fn(() => promise), resolve, reject };
  }

  async function attachPhoto(drop: (...files: File[]) => void) {
    drop(png('photo.png'));

    await screen.findByRole('group', { name: 'photo.png, ready' });
  }

  it('clears the text and every card at Send, then discards them when the send resolves', async () => {
    const send = pendingSend();
    const { drop } = renderComposer({ onSubmit: send.onSubmit });

    await attachPhoto(drop);
    paste({ getData: () => 'p'.repeat(651) });
    await screen.findByRole('group', { name: 'Pasted text, PASTED, ready' });
    type('Hello');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(send.onSubmit).toHaveBeenCalledOnce();

    await waitFor(() => expect(composerText()).toBe(''));
    await waitFor(() => expect(screen.queryByTestId('attachment-card')).toBeNull());

    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    await settle(send.resolve);

    expect(screen.queryByTestId('attachment-card')).toBeNull();
    expect(composerText()).toBe('');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('restores the whole prompt when the send rejects into an untouched composer', async () => {
    const send = pendingSend();
    const onError = vi.fn();
    const { drop } = renderComposer({ onError, onSubmit: send.onSubmit });

    await attachPhoto(drop);
    type('Hello');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    await waitFor(() => expect(composerText()).toBe(''));

    expect(screen.queryByTestId('attachment-card')).toBeNull();

    await settle(() => send.reject(new Error('Offline')));

    expect(onError).toHaveBeenCalledWith(new Error('Offline'));

    await waitFor(() => expect(composerText()).toBe('Hello'));

    const photo = await screen.findByRole('group', { name: 'photo.png, ready' });

    expect(within(photo).getByRole('img', { name: 'photo.png' }).getAttribute('src')).toBe(
      'blob:preview',
    );
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(send.onSubmit).toHaveBeenLastCalledWith(prompt('Hello'), [
      { id: 'asset-1', filename: 'photo.png', mediaType: 'image/png' },
    ]);
  });

  it('keeps only new cards when the send rejects after the user attached more', async () => {
    const send = pendingSend();
    const onError = vi.fn();
    const { drop } = renderComposer({ onError, onSubmit: send.onSubmit });

    await attachPhoto(drop);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.queryByTestId('attachment-card')).toBeNull());

    paste({ getData: () => 'p'.repeat(651) });
    await screen.findByRole('group', { name: 'Pasted text, PASTED, ready' });

    await settle(() => send.reject(new Error('Offline')));

    expect(onError).toHaveBeenCalledWith(new Error('Offline'));
    expect(composerText()).toBe('');
    expect(screen.getAllByTestId('attachment-card')).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Pasted text, PASTED, ready' })).toBeTruthy();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    expect(send.onSubmit).toHaveBeenCalledWith(emptyPrompt, [
      { id: 'asset-1', filename: 'photo.png', mediaType: 'image/png' },
    ]);
  });

  it('keeps only new text when the send rejects after the user typed', async () => {
    const send = pendingSend();
    const { drop } = renderComposer({ onError: vi.fn(), onSubmit: send.onSubmit });

    await attachPhoto(drop);
    type('First');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(composerText()).toBe(''));

    expect(screen.queryByTestId('attachment-card')).toBeNull();

    type('Second');
    await settle(() => send.reject(new Error('Offline')));

    expect(composerText()).toBe('Second');
    expect(screen.queryByTestId('attachment-card')).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('keeps a card added while the send is pending once it resolves', async () => {
    const send = pendingSend();
    const { drop } = renderComposer({ onSubmit: send.onSubmit });

    await attachPhoto(drop);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(screen.queryByTestId('attachment-card')).toBeNull());

    paste({ getData: () => 'p'.repeat(651) });
    await screen.findByRole('group', { name: 'Pasted text, PASTED, ready' });

    await settle(send.resolve);

    expect(screen.getAllByTestId('attachment-card')).toHaveLength(1);
    expect(screen.getByRole('group', { name: 'Pasted text, PASTED, ready' })).toBeTruthy();
  });
});
