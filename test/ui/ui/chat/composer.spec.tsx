import { createFrogBotSDK } from '@frogbotai/sdk';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Composer, type ComposerProps } from '../../../../packages/ui/src/chat/composer';

const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

function uploadServer() {
  const files: File[] = [];
  const texts = new Map<string, string>();

  const fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const file = (init?.body as FormData).get('file') as File;

    files.push(file);

    return Response.json({
      doc: {
        id: `asset-${files.length}`,
        filename: file.name,
        mimeType: file.type,
        text: texts.get(file.name) ?? null,
      },
      message: 'Document successfully created.',
    });
  });

  return { fetch, files, texts };
}

function fileRefusal(name: string) {
  return Response.json(
    {
      errors: [
        {
          name: 'ValidationError',
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
  const sdk = createFrogBotSDK({ baseURL: '/api', fetch: server.fetch });

  const element = (next: Partial<ComposerProps>) => (
    <Composer
      aria-label="Message"
      sdk={sdk}
      assetsSlug="assets"
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

  it('submits with Enter, preserves Shift+Enter, and renders slots', () => {
    const onSubmit = vi.fn();
    render(
      <Composer
        aria-label="Message"
        onSubmit={onSubmit}
        startSlot={<span>start</span>}
        endSlot={<span>end</span>}
        submitContent="Send"
        stopContent="Stop"
      />,
    );
    const input = screen.getByLabelText('Message');
    fireEvent.change(input, { target: { value: 'Hello' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('Hello', []);
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

  it('supports a controlled value', () => {
    const onValueChange = vi.fn();
    render(
      <Composer
        aria-label="Message"
        value="Controlled"
        onValueChange={onValueChange}
        onSubmit={vi.fn()}
        submitContent="Send"
        stopContent="Stop"
      />,
    );
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Next' } });
    expect(onValueChange).toHaveBeenCalledWith('Next');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Controlled');
  });

  it('shows drag and disabled states without accepting files', () => {
    const { container, rerender } = render(
      <Composer aria-label="Message" onSubmit={vi.fn()} submitContent="Send" stopContent="Stop" />,
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
        aria-label="Message"
        disabled
        defaultValue="Hello"
        onSubmit={vi.fn()}
        submitContent="Send"
        stopContent="Stop"
      />,
    );
    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).disabled).toBe(true);
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

    expect(onSubmit).toHaveBeenCalledWith('', [
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
    expect(server.files.map(({ name, type }) => ({ name, type }))).toEqual([
      { name: 'app.js.txt', type: 'text/plain' },
    ]);
    expect(await server.files[0]?.text()).toBe("console.log('hi');");

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith('', [
      { id: 'asset-1', filename: 'app.js', mediaType: 'text/plain' },
    ]);
  });

  it('uploads a long paste as a text asset marked as pasted', async () => {
    const { onSubmit, server } = renderComposer();
    const text = 'p'.repeat(651);

    fireEvent.paste(screen.getByLabelText('Message'), { clipboardData: { getData: () => text } });

    expect(screen.getByRole('group', { name: 'Pasted text, PASTED, uploading' })).toBeTruthy();
    expect(await screen.findByRole('group', { name: 'Pasted text, PASTED, ready' })).toBeTruthy();
    expect(server.files[0]?.name).toMatch(/^pasted-\d+\.txt$/);
    expect(await server.files[0]?.text()).toBe(text);
    expect(status()).toBe('Pasted text attached');

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith('', [
      { id: 'asset-1', filename: 'Pasted text', mediaType: 'text/plain', origin: 'paste' },
    ]);
  });

  it('keeps 650 characters in the textarea and keeps a longer paste inline without storage', () => {
    const onSubmit = vi.fn();

    render(
      <Composer aria-label="Message" onSubmit={onSubmit} submitContent="Send" stopContent="Stop" />,
    );

    const input = screen.getByLabelText('Message') as HTMLTextAreaElement;

    fireEvent.paste(input, { clipboardData: { getData: () => 'a'.repeat(650) } });
    fireEvent.change(input, { target: { value: 'a'.repeat(650) } });

    expect(input.value).toBe('a'.repeat(650));
    expect(screen.queryByTestId('attachment-card')).toBeNull();

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.paste(input, { clipboardData: { getData: () => 'b'.repeat(651) } });

    expect(input.value).toBe('');
    expect(screen.getByRole('group', { name: 'Pasted text, PASTED, ready' }).dataset.state).toBe(
      'text',
    );
    expect(screen.queryByRole('button', { name: 'Add files' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith('', [
      {
        type: 'paste',
        text: 'b'.repeat(651),
        filename: expect.stringMatching(/^pasted-\d+\.txt$/),
      },
    ]);
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

    await act(async () => {
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

    expect(onSubmit).toHaveBeenCalledWith('', [
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

  it('shows a Word document the server refuses as red, without Retry', async () => {
    const { drop, onSubmit, server } = renderComposer();

    server.fetch.mockImplementationOnce(async () => fileRefusal('report.docx'));

    drop(binary('report.docx', DOCX_TYPE));

    const card = await screen.findByRole('group', { name: "report.docx, DOCX, won't be sent" });

    expect(card.dataset.state).toBe('refused');
    expect(description(card)).toBe("Won't be sent. This file couldn't be read.");
    expect(within(card).queryByRole('button', { name: /Retry/ })).toBeNull();
    expect(status()).toBe("report.docx won't be sent: this file couldn't be read");

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Summarise it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith('Summarise it', []);
    expect(server.fetch).toHaveBeenCalledOnce();
  });

  it('offers Retry when a Word document fails to upload for another reason', async () => {
    const { drop, server } = renderComposer();

    server.texts.set('report.docx', '# Report');
    server.fetch.mockImplementationOnce(async () =>
      Response.json({ errors: [{ message: 'Storage is unavailable.' }] }, { status: 500 }),
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

    server.fetch.mockImplementationOnce(async () =>
      Response.json({ errors: [{ message: 'Storage is unavailable.' }] }, { status: 500 }),
    );

    drop(new File(['retry'], 'retry.txt', { type: 'text/plain' }));

    const card = await screen.findByRole('group', { name: 'retry.txt, TXT, upload failed' });

    expect(description(card)).toBe('Upload failed. Storage is unavailable.');
    expect(status()).toBe('Upload failed: retry.txt');

    fireEvent.click(screen.getByRole('button', { name: 'Retry uploading retry.txt' }));

    expect(await screen.findByRole('group', { name: 'retry.txt, TXT, ready' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(server.fetch).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenCalledWith('', [
      { id: 'asset-1', filename: 'retry.txt', mediaType: 'text/plain' },
    ]);
  });

  it('shows a file over the upload limit as too large, without Retry', async () => {
    const { drop, server } = renderComposer();

    server.fetch.mockImplementationOnce(async () =>
      Response.json({ errors: [{ message: 'File size limit has been reached' }] }, { status: 413 }),
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

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Here' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith('Here', [
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

    expect(onSubmit).toHaveBeenCalledWith('', [
      { id: 'asset-1', filename: 'photo.png', mediaType: 'image/png' },
    ]);
  });

  it('waits for an upload before Send and forgets a file removed while uploading', async () => {
    const { drop, onSubmit, server } = renderComposer();
    const upload = deferred<Response>();

    server.fetch.mockImplementationOnce(() => upload.promise);

    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Hi' } });
    drop(new File(['notes'], 'notes.txt', { type: 'text/plain' }));

    await screen.findByRole('group', { name: 'notes.txt, TXT, uploading' });

    expect(screen.queryByRole('button', { name: 'Send' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Remove notes.txt' }));

    expect(status()).toBe('notes.txt removed');

    await act(async () => {
      upload.resolve(
        Response.json({ doc: { id: 'late', filename: 'notes.txt', mimeType: 'text/plain' } }),
      );
    });

    expect(screen.queryByTestId('attachment-card')).toBeNull();
    expect(status()).toBe('notes.txt removed');

    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(onSubmit).toHaveBeenCalledWith('Hi', []);
  });

  it('sends once when Enter is pressed twice before the submit settles', async () => {
    const submitted = deferred<void>();
    const { drop, onSubmit } = renderComposer();

    onSubmit.mockReturnValue(submitted.promise);
    drop(pdf('report.pdf'));

    await screen.findByRole('group', { name: 'report.pdf, PDF, ready' });

    fireEvent.keyDown(screen.getByLabelText('Message'), { key: 'Enter' });
    fireEvent.keyDown(screen.getByLabelText('Message'), { key: 'Enter' });

    expect(onSubmit).toHaveBeenCalledOnce();

    await act(async () => submitted.resolve());

    expect(screen.queryByTestId('attachment-card')).toBeNull();
  });
});
