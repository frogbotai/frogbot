import { describe, expect, it } from 'vitest';

import {
  attachmentKind,
  decodeText,
  kindIsCertain,
  removedMarker,
  repeatedMarker,
  sentMediaType,
  textAttachment,
  textLabel,
  unavailableMarker,
  unreadableFileMarker,
  unreadableMarker,
  unsupportedMarker,
} from '../../../../packages/frogbot/src/uploads/attachmentParts.js';
import { attachmentKindCases } from './attachmentKindCases.js';

describe('attachmentKind', () => {
  it.each(attachmentKindCases)('classifies $name as $kind', ({ kind, ...file }) => {
    expect(attachmentKind(file)).toBe(kind);
  });

  it('reads only the first 4 KB of the contents', () => {
    const head = new Uint8Array(8192).fill(0x61);

    head[5000] = 0;

    expect(attachmentKind({ mediaType: 'text/plain', filename: 'long.txt', head })).toBe('text');
  });
});

describe('kindIsCertain', () => {
  it.each([
    { mediaType: 'image/png', filename: 'photo.png' },
    { mediaType: 'application/pdf', filename: 'report.pdf' },
    { mediaType: 'application/octet-stream', filename: 'report.pdf' },
    { mediaType: '', filename: 'photo.jpg' },
  ])('needs no contents for $mediaType $filename', (file) => {
    expect(kindIsCertain(file)).toBe(true);
  });

  it.each([
    { mediaType: 'video/mp2t', filename: 'index.ts' },
    { mediaType: 'audio/mpeg', filename: 'song.mp3' },
    { mediaType: 'text/plain', filename: 'notes.txt' },
    { mediaType: 'image/svg+xml', filename: 'logo.svg' },
    { mediaType: 'application/zip', filename: 'archive.zip' },
  ])('needs the contents for $mediaType $filename', (file) => {
    expect(kindIsCertain(file)).toBe(false);
  });
});

describe('sentMediaType', () => {
  it.each([
    { mediaType: 'application/octet-stream', filename: 'report.pdf', sent: 'application/pdf' },
    { mediaType: '', filename: 'photo.JPG', sent: 'image/jpeg' },
    {
      mediaType: 'application/octet-stream',
      filename: 'archive.zip',
      sent: 'application/octet-stream',
    },
    { mediaType: 'image/png', filename: 'photo.pdf', sent: 'image/png' },
  ])('sends $filename typed "$mediaType" as $sent', ({ sent, ...file }) => {
    expect(sentMediaType(file)).toBe(sent);
  });
});

describe('decodeText', () => {
  it('drops a leading byte-order mark', () => {
    expect(decodeText(Uint8Array.from([0xef, 0xbb, 0xbf, 0x68, 0x69]))).toBe('hi');
  });

  it('replaces invalid UTF-8 with the replacement character', () => {
    expect(decodeText(Uint8Array.from([0x63, 0x61, 0x66, 0xe9]))).toBe('caf\ufffd');
  });

  it('decodes multi-byte characters', () => {
    expect(decodeText(new TextEncoder().encode('naïve ✓'))).toBe('naïve ✓');
  });
});

describe('text labels', () => {
  it('labels a file with its real name', () => {
    expect(textLabel({ filename: 'app.js' })).toBe('Attached file "app.js":');
  });

  it('labels a paste regardless of its file name', () => {
    expect(textLabel({ filename: 'Pasted text', origin: 'paste' })).toBe('Pasted text:');
  });

  it('labels a file without a name', () => {
    expect(textLabel({})).toBe('Attached file:');
  });

  it('puts the contents on the line after the label', () => {
    expect(textAttachment({ filename: 'notes.md', text: '# Notes' })).toBe(
      'Attached file "notes.md":\n# Notes',
    );
  });
});

describe('markers', () => {
  it.each([
    ['image', 'photo.png', "[Can't read photo.png: this model doesn't accept images]"],
    ['pdf', 'report.pdf', "[Can't read report.pdf: this model doesn't accept PDFs]"],
    ['audio', 'memo.wav', "[Can't read memo.wav: this model doesn't accept audio]"],
    ['video', 'clip.mp4', "[Can't read clip.mp4: this model doesn't accept video]"],
  ] as const)('names an unreadable %s', (kind, filename, marker) => {
    expect(unreadableMarker({ kind, filename })).toBe(marker);
  });

  it('names each marker after the file', () => {
    expect(unsupportedMarker({ filename: 'report.pptx' })).toBe(
      "[Can't read report.pptx: this file type isn't supported]",
    );
    expect(unavailableMarker({ kind: 'pdf', filename: 'report.pdf' })).toBe(
      "[Can't read report.pdf: the file couldn't be loaded]",
    );
    expect(unreadableFileMarker({ filename: 'report.docx' })).toBe(
      "[Can't read report.docx: the file couldn't be read]",
    );
    expect(repeatedMarker({ kind: 'pdf', filename: 'report.pdf' })).toBe(
      '[File repeated later: report.pdf]',
    );
    expect(removedMarker({ kind: 'image', filename: 'photo.png' })).toBe(
      '[Image removed: photo.png]',
    );
    expect(removedMarker({ kind: 'pdf', filename: 'report.pdf' })).toBe(
      '[File removed: report.pdf]',
    );
  });

  it('uses the kind word when a file has no name', () => {
    expect(unreadableMarker({ kind: 'pdf' })).toBe(
      "[Can't read PDF: this model doesn't accept PDFs]",
    );
    expect(unsupportedMarker({ filename: '  ' })).toBe(
      "[Can't read file: this file type isn't supported]",
    );
    expect(unavailableMarker({})).toBe("[Can't read file: the file couldn't be loaded]");
    expect(unreadableFileMarker({})).toBe("[Can't read file: the file couldn't be read]");
    expect(repeatedMarker({ kind: 'text' })).toBe('[File repeated later: text]');
    expect(removedMarker({ kind: 'image' })).toBe('[Image removed: image]');
    expect(removedMarker({ kind: 'video' })).toBe('[File removed: video]');
  });
});
