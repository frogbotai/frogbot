import { createRequire } from 'node:module';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { docxText } from '../../../../../packages/frogbot/src/uploads/office/docxText.js';
import { docxFile, reportDocx, reportText, xlsxFile } from '../../../../__helpers/shared/office.js';

type MammothZip = {
  read: (name: string, encoding?: string) => Promise<unknown>;
};

const mammothZip = createRequire(new URL('../../../../../packages/frogbot/', import.meta.url))(
  'mammoth/lib/zipfile.js',
) as { openArrayBuffer: (buffer: Buffer) => Promise<MammothZip> };

const run = (text: string) => `<w:r><w:t xml:space="preserve">${text}</w:t></w:r>`;

const paragraph = (content: string, style?: string) =>
  `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ''}${content}</w:p>`;

const listItem = (text: string, { list, level = 0 }: { list: number; level?: number }) =>
  `<w:p><w:pPr><w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${list}"/></w:numPr></w:pPr>${run(text)}</w:p>`;

const cell = (content: string, properties = '') =>
  `<w:tc>${properties && `<w:tcPr>${properties}</w:tcPr>`}${content || '<w:p/>'}</w:tc>`;

const table = (rows: string[][]) =>
  `<w:tbl>${rows.map((cells) => `<w:tr>${cells.join('')}</w:tr>`).join('')}</w:tbl>`;

const numbering = [
  '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>',
  '<w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>',
  '<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>',
  '<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>',
].join('');

const image = (id: string) =>
  `<w:r><w:drawing><wp:inline><wp:docPr id="1" name="Picture 1" descr="A chart"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="${id}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('docxText', () => {
  it('writes headings, paragraphs, lists and tables as plain text', async () => {
    expect(await docxText(reportDocx())).toBe(reportText);
  });

  it('marks each heading level', async () => {
    const document = docxFile({
      body: paragraph(run('Details'), 'Heading2') + paragraph(run('Notes'), 'Heading3'),
    });

    const text = await docxText(document);

    expect(text).toBe('## Details\n\n### Notes');
  });

  it('numbers ordered lists and indents nested items', async () => {
    const document = docxFile({
      body: [
        listItem('Plan', { list: 2 }),
        listItem('Detail', { list: 2, level: 1 }),
        listItem('Ship', { list: 2 }),
      ].join(''),
      numbering,
    });

    const text = await docxText(document);

    expect(text).toBe('1. Plan\n   - Detail\n2. Ship');
  });

  it('keeps merged table cells in their columns', async () => {
    const document = docxFile({
      body: table([
        [
          cell(paragraph(run('Region')), '<w:vMerge w:val="restart"/>'),
          cell(paragraph(run('Sales')), '<w:gridSpan w:val="2"/>'),
        ],
        [cell('', '<w:vMerge/>'), cell(paragraph(run('Q1'))), cell(paragraph(run('Q2')))],
        [
          cell(paragraph(run('North'))),
          cell(paragraph(run('1|2'))),
          cell(paragraph(run('3')) + paragraph(run('4'))),
        ],
      ]),
    });

    const text = await docxText(document);

    expect(text).toBe(
      [
        '| Region | Sales |  |',
        '| --- | --- | --- |',
        '|  | Q1 | Q2 |',
        '| North | 1\\|2 | 3 4 |',
      ].join('\n'),
    );
  });

  it('lists footnotes at the end', async () => {
    const document = docxFile({
      body: paragraph(`${run('Claim')}<w:r><w:footnoteReference w:id="1"/></w:r>${run('.')}`),
      footnotes: `<w:footnote w:id="1"><w:p><w:r><w:footnoteRef/></w:r>${run(' The source.')}</w:p></w:footnote>`,
    });

    const text = await docxText(document);

    expect(text).toBe('Claim[1].\n\n1. The source.');
  });

  it('writes external links with their address', async () => {
    const document = docxFile({
      body: [
        paragraph(
          `${run('Visit ')}<w:hyperlink r:id="rIdSite">${run('FrogBot')}</w:hyperlink>${run(' today.')}`,
        ),
        paragraph(`<w:hyperlink r:id="rIdPlain">${run('https://example.com')}</w:hyperlink>`),
        paragraph(
          `<w:bookmarkStart w:id="0" w:name="intro"/>${run('Intro')}<w:bookmarkEnd w:id="0"/>`,
        ),
        paragraph(`<w:hyperlink w:anchor="intro">${run('See the intro')}</w:hyperlink>`),
      ].join(''),
      hyperlinks: { rIdSite: 'https://frogbot.ai', rIdPlain: 'https://example.com' },
    });

    const text = await docxText(document);

    expect(text).toBe(
      'Visit FrogBot (https://frogbot.ai) today.\n\nhttps://example.com\n\nIntro\n\nSee the intro',
    );
  });

  it('keeps tracked insertions and drops tracked deletions', async () => {
    const document = docxFile({
      body: paragraph(
        `${run('Keep ')}<w:ins w:id="1" w:author="A">${run('added')}</w:ins><w:del w:id="2" w:author="A"><w:r><w:delText>removed</w:delText></w:r></w:del>`,
      ),
    });

    const text = await docxText(document);

    expect(text).toBe('Keep added');
  });

  it('leaves out headers, footers and comments', async () => {
    const document = docxFile({
      body: [
        paragraph(
          `<w:commentRangeStart w:id="0"/>${run('Body')}<w:commentRangeEnd w:id="0"/><w:r><w:commentReference w:id="0"/></w:r>`,
        ),
        '<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/></w:sectPr>',
      ].join(''),
      comments: `<w:comment w:id="0" w:author="A" w:initials="A">${paragraph(run('A comment'))}</w:comment>`,
      header: paragraph(run('Header text')),
      footer: paragraph(run('Footer text')),
    });

    const text = await docxText(document);

    expect(text).toBe('Body');
  });

  it('adds nothing for an image', async () => {
    const document = docxFile({
      body: paragraph(`${run('Before ')}${image('rIdImage')}${run('after')}`),
      images: { rIdImage: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]) },
    });

    const text = await docxText(document);

    expect(text).toBe('Before after');
  });

  it('never reads image data', async () => {
    const reads: string[] = [];
    const openArrayBuffer = mammothZip.openArrayBuffer;

    vi.spyOn(mammothZip, 'openArrayBuffer').mockImplementation(async (buffer) => {
      const zip = await openArrayBuffer(buffer);

      return {
        ...zip,
        read: (name: string, encoding?: string) => {
          reads.push(name);

          return zip.read(name, encoding);
        },
      };
    });

    await docxText(
      docxFile({
        body: paragraph(image('rIdImage')),
        images: { rIdImage: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]) },
      }),
    );

    expect(reads).toContain('word/document.xml');
    expect(reads).not.toContain('word/media/rIdImage.png');
  });

  it('writes checkboxes as [x] and [ ]', async () => {
    const checkbox = (checked: boolean) =>
      `<w:r><w:fldChar w:fldCharType="begin"><w:ffData><w:checkBox><w:default w:val="${checked ? 1 : 0}"/></w:checkBox></w:ffData></w:fldChar></w:r><w:r><w:instrText xml:space="preserve"> FORMCHECKBOX </w:instrText></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;

    const document = docxFile({
      body:
        paragraph(`${checkbox(true)}${run(' Done')}`) +
        paragraph(`${checkbox(false)}${run(' Open')}`),
    });

    const text = await docxText(document);

    expect(text).toBe('[x] Done\n\n[ ] Open');
  });

  it('decodes escaped characters', async () => {
    const document = docxFile({ body: paragraph(run('Fish &amp; chips &lt;3 "always"')) });

    const text = await docxText(document);

    expect(text).toBe('Fish & chips <3 "always"');
  });

  it('keeps tabs and line breaks and removes control characters', async () => {
    const document = docxFile({
      body: paragraph(
        `${run('a&#x1;b&#xC;c&#13;\tafter tab')}<w:r><w:br/></w:r>${run('next line')}`,
      ),
    });

    const text = await docxText(document);

    expect(text).toBe('abc\tafter tab\nnext line');
  });

  it('gives an empty document no text', async () => {
    const text = await docxText(docxFile({ body: '' }));

    expect(text).toBe('');
  });

  it('refuses an Excel workbook as invalid', async () => {
    const workbook = xlsxFile({ sheets: [{ name: 'Q1', xml: '<sheetData/>' }] });

    await expect(docxText(workbook)).rejects.toMatchObject({
      name: 'OfficeFileError',
      reason: 'invalid',
    });
  });

  it('refuses a PDF as invalid', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');

    await expect(docxText(pdf)).rejects.toMatchObject({ reason: 'invalid' });
  });
});
