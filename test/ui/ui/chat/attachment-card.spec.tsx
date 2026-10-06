import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import {
  AttachmentCard,
  type AttachmentCardProps,
} from '../../../../packages/ui/src/chat/attachment-card';

const largeHint =
  'Large file (11.2 MB). In long chats, older files may be left out to keep requests small.';

function renderCard(props: Partial<AttachmentCardProps> = {}) {
  render(<AttachmentCard name="notes.md" state="ready" {...props} />);

  return screen.getByTestId('attachment-card');
}

function description(element: HTMLElement) {
  return (element.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ');
}

describe('AttachmentCard', () => {
  it('names a ready file and offers only Remove', () => {
    const remove = vi.fn();
    const card = renderCard({ name: 'report.pdf', typeLabel: 'PDF', onRemove: remove });

    expect(card.getAttribute('data-state')).toBe('ready');
    expect(card.className).toBe('fb-attachment-card fb-attachment-card--ready');
    expect(screen.getByRole('group', { name: 'report.pdf, PDF, ready' })).toBe(card);
    expect(card.getAttribute('aria-describedby')).toBeNull();
    expect(within(card).getByText('PDF').className).toBe('fb-attachment-card__tag');
    expect(
      within(card)
        .getAllByRole('button')
        .map((button: HTMLElement) => button.getAttribute('aria-label')),
    ).toEqual(['Remove report.pdf']);
  });

  it('removes the file when Remove is pressed', async () => {
    const user = userEvent.setup();
    const remove = vi.fn();

    renderCard({ onRemove: remove });

    await user.click(screen.getByRole('button', { name: 'Remove notes.md' }));

    expect(remove).toHaveBeenCalledOnce();
  });

  it('shows an image preview inside the card', () => {
    const card = renderCard({ name: 'photo.png', preview: <img src="blob:photo" alt="" /> });

    expect(card.querySelector('.fb-attachment-card__preview img')?.getAttribute('src')).toBe(
      'blob:photo',
    );
  });

  it('marks an uploading card busy and keeps its spinner label', () => {
    const card = renderCard({ state: 'uploading' });

    expect(card.getAttribute('aria-busy')).toBe('true');
    expect(card.className).toContain('fb-attachment-card--uploading');
    expect(screen.getByRole('group', { name: 'notes.md, uploading' })).toBe(card);
    expect(screen.getByRole('img', { name: 'Uploading notes.md' })).toBeTruthy();
  });

  it('shows a text card with a preview and its type label', () => {
    const card = renderCard({ state: 'text', typeLabel: 'MD', text: '# Notes\nFirst line' });

    expect(card.className).toBe('fb-attachment-card fb-attachment-card--text');
    expect(screen.getByRole('group', { name: 'notes.md, MD, ready' })).toBe(card);
    expect(card.querySelector('.fb-attachment-card__snippet')?.textContent).toBe(
      '# Notes\nFirst line',
    );
    expect(screen.getByRole('button', { name: 'Open notes.md' })).toBeTruthy();
  });

  it('labels pasted text PASTED', () => {
    renderCard({ name: 'Pasted text', state: 'text', typeLabel: 'PASTED', text: 'Hello' });

    expect(screen.getByRole('group', { name: 'Pasted text, PASTED, ready' })).toBeTruthy();
    expect(screen.getByText('PASTED')).toBeTruthy();
  });

  it('previews only the start of a very long text', () => {
    const card = renderCard({ state: 'text', text: 'x'.repeat(2_000_000) });

    expect(card.querySelector('.fb-attachment-card__snippet')?.textContent).toHaveLength(500);
  });

  it.each([
    {
      state: 'refused' as const,
      reason: undefined,
      name: "report.zip, won't be sent",
      text: "Won't be sent. This file type isn't supported.",
    },
    {
      state: 'refused' as const,
      reason: "Claude Haiku can't read images.",
      name: "report.zip, won't be sent",
      text: "Won't be sent. Claude Haiku can't read images.",
    },
    {
      state: 'too-large' as const,
      reason: undefined,
      name: 'report.zip, too large to upload',
      text: 'Too large to upload. This file is larger than this app allows.',
    },
    {
      state: 'failed' as const,
      reason: undefined,
      name: 'report.zip, upload failed',
      text: 'Upload failed. Check your connection and try again.',
    },
    {
      state: 'failed' as const,
      reason: 'Storage is full.',
      name: 'report.zip, upload failed',
      text: 'Upload failed. Storage is full.',
    },
  ])('explains a $state card in words: $text', ({ state, reason, name, text }) => {
    const card = renderCard({ name: 'report.zip', state, reason });

    expect(card.className).toBe(`fb-attachment-card fb-attachment-card--${state}`);
    expect(screen.getByRole('group', { name })).toBe(card);
    expect(description(card)).toBe(text);
    expect(within(card).getByText('report.zip')).toBeTruthy();
  });

  it('offers Retry on a failed upload', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();

    const card = renderCard({ state: 'failed', onRetry: retry, onRemove: vi.fn() });

    await user.click(screen.getByRole('button', { name: 'Retry uploading notes.md' }));

    expect(retry).toHaveBeenCalledOnce();
    expect(
      within(card)
        .getAllByRole('button')
        .map((button: HTMLElement) => button.getAttribute('aria-label')),
    ).toEqual(['Retry uploading notes.md', 'Remove notes.md']);
  });

  it.each(['too-large', 'refused'] as const)('offers no Retry on a %s card', (state) => {
    renderCard({ state, onRetry: vi.fn(), onRemove: vi.fn() });

    expect(screen.queryByRole('button', { name: /Retry/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Remove notes.md' })).toBeTruthy();
  });

  it('shows the large-file tag over 10 MB and describes it', () => {
    const card = renderCard({ state: 'text', text: 'big', size: 11_200_000 });

    expect(card.className).toBe(
      'fb-attachment-card fb-attachment-card--text fb-attachment-card--large',
    );
    expect(within(card).getByText('Large file').className).toBe('fb-attachment-card__hint');
    expect(description(card)).toBe(largeHint);
  });

  it('shows the large-file tag just over 10,000,000 bytes', () => {
    renderCard({ size: 10_000_001 });

    expect(screen.getByText('Large file')).toBeTruthy();
  });

  it.each([9_000_000, 10_000_000])('shows no large-file tag at %i bytes', (size) => {
    const card = renderCard({ size });

    expect(screen.queryByText('Large file')).toBeNull();
    expect(card.className).not.toContain('fb-attachment-card--large');
  });

  it('shows no large-file tag on a card that won’t be sent', () => {
    const card = renderCard({ state: 'refused', size: 11_200_000 });

    expect(screen.queryByText('Large file')).toBeNull();
    expect(description(card)).toBe("Won't be sent. This file type isn't supported.");
  });

  it('shows the same large-file sentence in a tooltip', async () => {
    const user = userEvent.setup();

    renderCard({ size: 11_200_000 });

    await user.hover(screen.getByText('Large file'));

    expect((await screen.findByRole('tooltip', {}, { timeout: 2000 })).textContent).toBe(largeHint);
  });
});

describe('AttachmentViewer', () => {
  it('opens the full text with the file name and returns focus on Escape', async () => {
    const user = userEvent.setup();

    renderCard({ state: 'text', typeLabel: 'JS', name: 'app.js', text: 'const a = 1;\n' });

    const open = screen.getByRole('button', { name: 'Open app.js' });

    await user.click(open);

    const dialog = await screen.findByRole('dialog', { name: 'app.js' });

    expect(dialog.querySelector('pre')?.textContent).toBe('const a = 1;\n');
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(open);
  });

  it('keeps focus inside the dialog', async () => {
    const user = userEvent.setup();

    renderCard({ state: 'text', name: 'app.js', text: 'code' });

    await user.click(screen.getByRole('button', { name: 'Open app.js' }));

    const dialog = await screen.findByRole('dialog');

    for (let step = 0; step < 4; step += 1) {
      await user.tab();

      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });

  it('closes with Close and returns focus to the card', async () => {
    const user = userEvent.setup();

    renderCard({ state: 'text', name: 'app.js', text: 'code' });

    const open = screen.getByRole('button', { name: 'Open app.js' });

    await user.click(open);
    await user.click(await screen.findByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(open);
  });

  it('copies the full text and announces it', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    const text = 'y'.repeat(1000);

    renderCard({ state: 'text', name: 'notes.md', text });

    await user.click(screen.getByRole('button', { name: 'Open notes.md' }));

    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    await user.click(await screen.findByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith(text);
    expect((await screen.findByRole('status')).textContent).toBe('Copied');
  });

  it('announces when copying fails', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));

    renderCard({ state: 'text', name: 'notes.md', text: 'words' });

    await user.click(screen.getByRole('button', { name: 'Open notes.md' }));

    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    await user.click(await screen.findByRole('button', { name: 'Copy' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe("Couldn't copy"));
  });

  it('offers no viewer while a text attachment is uploading', () => {
    const card = renderCard({ state: 'uploading', name: 'Pasted text', text: 'Hello' });

    expect(card.querySelector('.fb-attachment-card__snippet')?.textContent).toBe('Hello');
    expect(screen.queryByRole('button', { name: 'Open Pasted text' })).toBeNull();
  });
});
