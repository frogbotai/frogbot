import { randomBytes } from 'node:crypto';

import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { checkOfficeZip } from '../../../../../packages/frogbot/src/uploads/office/zipGuard.js';
import {
  docxFile,
  encryptedOfficeFile,
  manyEntries,
  oleFile,
  sharedDataEntries,
  storedZip,
  streamedZip,
  withCommentDirectory,
  withoutUtf8Names,
  withTrailingBytes,
  xlsxFile,
  zipBomb,
} from '../../../../__helpers/shared/office.js';

const paragraph = '<w:p><w:r><w:t>Hello</w:t></w:r></w:p>';

describe('checkOfficeZip', () => {
  it('returns a Word document as a new archive with the same entries', async () => {
    const document = docxFile({ body: paragraph });

    const archive = await checkOfficeZip(document);

    expect(archive).not.toBe(document);
    expect(unzipSync(archive)).toEqual(unzipSync(document));
  });

  it('accepts an Excel workbook', async () => {
    const workbook = xlsxFile({
      sheets: [
        { name: 'Q1', xml: '<sheetData><row r="1"><c r="A1"><v>1</v></c></row></sheetData>' },
      ],
    });

    const archive = await checkOfficeZip(workbook);

    expect(unzipSync(archive)).toEqual(unzipSync(workbook));
  });

  it('accepts a zip written with data descriptors', async () => {
    const files = {
      'word/document.xml': strToU8(`<w:document>${paragraph.repeat(100)}</w:document>`),
      'word/styles.xml': strToU8('<w:styles/>'),
    };

    const archive = await checkOfficeZip(streamedZip(files));

    expect(unzipSync(archive)).toEqual(files);
  });

  it("accepts large images that don't expand", async () => {
    const document = docxFile({ body: paragraph, images: { rIdImage: randomBytes(60_000_000) } });

    const archive = await checkOfficeZip(document);

    expect(archive.byteLength).toBeGreaterThan(60_000_000);
  });

  it('leaves out empty directory entries', async () => {
    const zip = storedZip([
      { name: 'word/' },
      { name: 'word/document.xml', data: strToU8(`<w:document>${paragraph}</w:document>`) },
    ]);

    const archive = await checkOfficeZip(zip);

    expect(Object.keys(unzipSync(archive))).toEqual(['word/document.xml']);
  });

  it('keeps a name written outside UTF-8 as the Office readers decode it', async () => {
    const zip = withoutUtf8Names(zipSync({ 'xl/s\u00e9.xml': strToU8('<a/>') }));

    const archive = await checkOfficeZip(zip);

    expect(Object.keys(unzipSync(archive))).toEqual(['xl/s\u00c3\u00a9.xml']);
  });

  it('refuses a directory entry that holds data', async () => {
    const zip = storedZip([{ name: 'word/', data: strToU8('<a/>') }]);

    await expect(checkOfficeZip(zip)).rejects.toMatchObject({
      name: 'OfficeFileError',
      reason: 'invalid',
    });
  });

  it('refuses two entries with the same name', async () => {
    const zip = storedZip([
      { name: 'word/document.xml', data: strToU8(`<w:document>${paragraph}</w:document>`) },
      { name: 'word/document.xml', data: strToU8('<w:document/>') },
    ]);

    await expect(checkOfficeZip(zip)).rejects.toMatchObject({ reason: 'invalid' });
  });

  it.each([
    ['an empty name', ''],
    ['an absolute path', '/word/document.xml'],
    ['a parent segment', 'word/../document.xml'],
    ['a leading parent segment', '../document.xml'],
    ['a backslash', 'word\\document.xml'],
    ['a NUL character', 'word/document.xml\u0000.png'],
    ['an object prototype key', '__proto__'],
  ])('refuses an entry name with %s', async (_, name) => {
    const zip = storedZip([
      { name: 'word/document.xml', data: strToU8(`<w:document>${paragraph}</w:document>`) },
      { name, data: strToU8('<a/>') },
    ]);

    await expect(checkOfficeZip(zip)).rejects.toMatchObject({ reason: 'invalid' });
  });

  it('refuses bytes after the end of the zip directory', async () => {
    const zip = withTrailingBytes({ zip: docxFile({ body: paragraph }), bytes: strToU8('junk') });

    await expect(checkOfficeZip(zip)).rejects.toMatchObject({ reason: 'invalid' });
  });

  it('returns only the entries of the directory it checked', async () => {
    const hidden = docxFile({ body: '<w:p><w:r><w:t>Hidden</w:t></w:r></w:p>' });
    const zip = withCommentDirectory({ zip: docxFile({ body: paragraph }), hidden });

    const archive = await checkOfficeZip(zip);

    expect(unzipSync(archive)).toEqual(unzipSync(hidden));
  });

  it('refuses a file that expands past 50 MiB', async () => {
    await expect(checkOfficeZip(zipBomb())).rejects.toMatchObject({
      name: 'OfficeFileError',
      reason: 'too-large',
    });
  });

  it('refuses an expanding entry whatever its name', async () => {
    await expect(checkOfficeZip(zipBomb({ path: 'word/media/image1.png' }))).rejects.toMatchObject({
      reason: 'too-large',
    });
  });

  it('refuses a file that expands past the size it declares', async () => {
    await expect(checkOfficeZip(zipBomb({ declaredBytes: 1_000 }))).rejects.toMatchObject({
      reason: 'too-large',
    });
  });

  it('accepts 10,000 entries', { timeout: 30_000 }, async () => {
    const archive = await checkOfficeZip(manyEntries(10_000));

    expect(Object.keys(unzipSync(archive))).toHaveLength(10_000);
  });

  it('refuses 10,001 entries', async () => {
    await expect(checkOfficeZip(manyEntries(10_001))).rejects.toMatchObject({
      reason: 'too-large',
    });
  });

  it('refuses entries that point at the same stored data', async () => {
    const zip = zipSync({
      'word/document.xml': strToU8(`<w:document>${paragraph}</w:document>`),
      'word/padding.xml': [new Uint8Array(1_000_000).fill(0x20), { level: 0 }],
    });

    const shared = sharedDataEntries({ zip, name: 'word/padding.xml', copies: 200 });

    await expect(checkOfficeZip(shared)).rejects.toMatchObject({ reason: 'too-large' });
  });

  it('refuses entries that share stored data even within the size budget', async () => {
    const zip = zipSync({
      'word/document.xml': strToU8(`<w:document>${paragraph}</w:document>`),
      'word/padding.xml': [new Uint8Array(1_000).fill(0x20), { level: 0 }],
    });

    const shared = sharedDataEntries({ zip, name: 'word/padding.xml', copies: 2 });

    await expect(checkOfficeZip(shared)).rejects.toMatchObject({ reason: 'too-large' });
  });

  it('reports an encrypted Office file as password-protected', async () => {
    await expect(checkOfficeZip(encryptedOfficeFile())).rejects.toMatchObject({
      reason: 'encrypted',
    });
  });

  it('finds the encryption stream past the first directory sector', async () => {
    const file = oleFile({
      streams: ['\u0005SummaryInformation', 'Data', 'Table', 'EncryptionInfo'],
    });

    await expect(checkOfficeZip(file)).rejects.toMatchObject({ reason: 'encrypted' });
  });

  it.each([
    ['an Excel 97-2003 workbook', ['Workbook', '\u0005SummaryInformation']],
    ['a Word 97-2003 document', ['WordDocument', '1Table', '\u0005SummaryInformation']],
  ])('refuses %s as invalid', async (_, streams) => {
    await expect(checkOfficeZip(oleFile({ streams }))).rejects.toMatchObject({
      reason: 'invalid',
    });
  });

  it('refuses a damaged OLE file as invalid', async () => {
    await expect(checkOfficeZip(encryptedOfficeFile().subarray(0, 600))).rejects.toMatchObject({
      reason: 'invalid',
    });
  });

  it('refuses a PDF', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

    await expect(checkOfficeZip(pdf)).rejects.toMatchObject({ reason: 'invalid' });
  });

  it('refuses a truncated zip', async () => {
    const document = docxFile({ body: paragraph });

    await expect(checkOfficeZip(document.subarray(0, -10))).rejects.toMatchObject({
      reason: 'invalid',
    });
  });
});
