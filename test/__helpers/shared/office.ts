import { crc32 } from 'node:zlib';

import { strFromU8, strToU8, Zip, ZipDeflate, type Zippable, zipSync } from 'fflate';

export type DocxFileProps = {
  body: string;
  numbering?: string;
  footnotes?: string;
  comments?: string;
  header?: string;
  footer?: string;
  images?: Record<string, Uint8Array>;
  hyperlinks?: Record<string, string>;
};

export type XlsxSheet = {
  name: string;
  xml: string;
  hidden?: boolean;
};

export type XlsxFileProps = {
  sheets: XlsxSheet[];
  sharedStrings?: string[];
  styles?: string;
};

type Relationship = {
  id: string;
  type: string;
  target: string;
  external?: boolean;
};

const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';

const RELATIONSHIP_TYPES = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

const WORD_NAMESPACES = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  `xmlns:r="${RELATIONSHIP_TYPES}"`,
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
].join(' ');

const SHEET_NAMESPACES = [
  'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
  `xmlns:r="${RELATIONSHIP_TYPES}"`,
].join(' ');

const WORD_PARTS = [
  { key: 'numbering', root: 'w:numbering', path: 'numbering.xml' },
  { key: 'footnotes', root: 'w:footnotes', path: 'footnotes.xml' },
  { key: 'comments', root: 'w:comments', path: 'comments.xml' },
  { key: 'header', root: 'w:hdr', path: 'header1.xml' },
  { key: 'footer', root: 'w:ftr', path: 'footer1.xml' },
] as const;

const CONTENT_TYPES = `${XML_DECLARATION}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/></Types>`;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function relationships(entries: Relationship[]): string {
  const items = entries.map(
    ({ id, type, target, external }) =>
      `<Relationship Id="${id}" Type="${RELATIONSHIP_TYPES}/${type}" Target="${escapeXml(target)}"${external ? ' TargetMode="External"' : ''}/>`,
  );

  return `${XML_DECLARATION}<Relationships xmlns="${RELATIONSHIPS_NS}">${items.join('')}</Relationships>`;
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));

  let offset = 0;

  chunks.forEach((chunk) => {
    result.set(chunk, offset);

    offset += chunk.byteLength;
  });

  return result;
}

export function docxFile({
  body,
  images = {},
  hyperlinks = {},
  ...parts
}: DocxFileProps): Uint8Array {
  const files: Zippable = {
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(
      relationships([{ id: 'rId1', type: 'officeDocument', target: 'word/document.xml' }]),
    ),
    'word/document.xml': strToU8(
      `${XML_DECLARATION}<w:document ${WORD_NAMESPACES}><w:body>${body}</w:body></w:document>`,
    ),
  };

  const links: Relationship[] = [];

  WORD_PARTS.forEach(({ key, root, path }) => {
    const xml = parts[key];

    if (xml === undefined) return;

    files[`word/${path}`] = strToU8(
      `${XML_DECLARATION}<${root} ${WORD_NAMESPACES}>${xml}</${root}>`,
    );

    links.push({ id: `rId${key[0].toUpperCase()}${key.slice(1)}`, type: key, target: path });
  });

  Object.entries(images).forEach(([id, data]) => {
    const path = `media/${id}.png`;

    files[`word/${path}`] = [data, { level: 0 }];

    links.push({ id, type: 'image', target: path });
  });

  Object.entries(hyperlinks).forEach(([id, target]) => {
    links.push({ id, type: 'hyperlink', target, external: true });
  });

  files['word/_rels/document.xml.rels'] = strToU8(relationships(links));

  return zipSync(files);
}

export function xlsxFile({ sheets, sharedStrings, styles }: XlsxFileProps): Uint8Array {
  const sheetElements = sheets.map(
    ({ name, hidden }, index) =>
      `<sheet name="${escapeXml(name)}" sheetId="${index + 1}"${hidden ? ' state="hidden"' : ''} r:id="rIdSheet${index + 1}"/>`,
  );

  const links: Relationship[] = sheets.map((_, index) => ({
    id: `rIdSheet${index + 1}`,
    type: 'worksheet',
    target: `worksheets/sheet${index + 1}.xml`,
  }));

  const files: Zippable = {
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    '_rels/.rels': strToU8(
      relationships([{ id: 'rId1', type: 'officeDocument', target: 'xl/workbook.xml' }]),
    ),
    'xl/workbook.xml': strToU8(
      `${XML_DECLARATION}<workbook ${SHEET_NAMESPACES}><sheets>${sheetElements.join('')}</sheets></workbook>`,
    ),
  };

  sheets.forEach(({ xml }, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(
      `${XML_DECLARATION}<worksheet ${SHEET_NAMESPACES}>${xml}</worksheet>`,
    );
  });

  if (sharedStrings) {
    const items = sharedStrings.map(
      (value) => `<si><t xml:space="preserve">${escapeXml(value)}</t></si>`,
    );

    files['xl/sharedStrings.xml'] = strToU8(
      `${XML_DECLARATION}<sst ${SHEET_NAMESPACES} count="${items.length}" uniqueCount="${items.length}">${items.join('')}</sst>`,
    );

    links.push({ id: 'rIdSharedStrings', type: 'sharedStrings', target: 'sharedStrings.xml' });
  }

  if (styles !== undefined) {
    files['xl/styles.xml'] = strToU8(
      `${XML_DECLARATION}<styleSheet ${SHEET_NAMESPACES}>${styles}</styleSheet>`,
    );

    links.push({ id: 'rIdStyles', type: 'styles', target: 'styles.xml' });
  }

  files['xl/_rels/workbook.xml.rels'] = strToU8(relationships(links));

  return zipSync(files);
}

const wordParagraph = (text: string, properties = '') =>
  `<w:p>${properties && `<w:pPr>${properties}</w:pPr>`}<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;

const wordBullet = (text: string) =>
  wordParagraph(text, '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');

const wordTable = (rows: string[][]) =>
  `<w:tbl>${rows.map((cells) => `<w:tr>${cells.map((cell) => `<w:tc>${wordParagraph(cell)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`;

const BULLET_NUMBERING =
  '<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>';

const sheetText = (ref: string, value: string) =>
  `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;

const sheetNumber = (ref: string, value: number, style?: number) =>
  `<c r="${ref}"${style === undefined ? '' : ` s="${style}"`}><v>${value}</v></c>`;

const sheetRow = (index: number, cells: string[]) => `<row r="${index}">${cells.join('')}</row>`;

const DATE_STYLES =
  '<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14" applyNumberFormat="1"/></cellXfs>';

export const reportText = [
  '# Quarterly report',
  '',
  'Intro paragraph.',
  '',
  '- First bullet',
  '- Second bullet',
  '',
  '| Region | Total |',
  '| --- | --- |',
  '| North | 1,200 |',
].join('\n');

export function reportDocx(): Uint8Array {
  return docxFile({
    body: [
      wordParagraph('Quarterly report', '<w:pStyle w:val="Heading1"/>'),
      wordParagraph('Intro paragraph.'),
      wordBullet('First bullet'),
      wordBullet('Second bullet'),
      wordTable([
        ['Region', 'Total'],
        ['North', '1,200'],
      ]),
    ].join(''),
    numbering: BULLET_NUMBERING,
  });
}

export const budgetText = [
  'Sheet "Q1":',
  'Item,Amount,Date',
  'Rent,1200,2026-01-15',
  '"Food, drinks",300.5,2026-02-01',
  'Total,1500.5,',
  'Merged note,,',
  '',
  'Sheet "Q2":',
  'Region,Target',
  'North,5000',
].join('\n');

export function budgetXlsx(): Uint8Array {
  const q1 = [
    sheetRow(1, [
      '<c r="A1" t="s"><v>0</v></c>',
      '<c r="B1" t="s"><v>1</v></c>',
      '<c r="C1" t="s"><v>2</v></c>',
    ]),
    sheetRow(2, [
      '<c r="A2" t="s"><v>3</v></c>',
      sheetNumber('B2', 1200),
      sheetNumber('C2', 46037, 1),
    ]),
    sheetRow(3, [
      sheetText('A3', 'Food, drinks'),
      sheetNumber('B3', 300.5),
      sheetNumber('C3', 46054, 1),
    ]),
    sheetRow(4, [sheetText('A4', 'Total'), '<c r="B4"><f>SUM(B2:B3)</f><v>1500.5</v></c>']),
    sheetRow(5, [sheetText('A5', 'Merged note')]),
  ];

  const q2 = [
    sheetRow(1, [sheetText('A1', 'Region'), sheetText('B1', 'Target')]),
    sheetRow(2, [sheetText('A2', 'North'), sheetNumber('B2', 5000)]),
  ];

  return xlsxFile({
    sheets: [
      {
        name: 'Q1',
        xml: `<sheetData>${q1.join('')}</sheetData><mergeCells count="1"><mergeCell ref="A5:C5"/></mergeCells>`,
      },
      { name: 'Q2', xml: `<sheetData>${q2.join('')}</sheetData>` },
      { name: 'Notes', xml: '<sheetData/>' },
    ],
    sharedStrings: ['Item', 'Amount', 'Date', 'Rent'],
    styles: DATE_STYLES,
  });
}

export function farCellXlsx(): Uint8Array {
  return xlsxFile({
    sheets: [
      {
        name: 'Q1',
        xml: '<sheetData><row r="1048576"><c r="XFD1048576"><v>1</v></c></row></sheetData>',
      },
    ],
  });
}

function headerOffsets(zip: Uint8Array, name: string): { local: number; central: number } {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const count = view.getUint16(zip.byteLength - 22 + 10, true);

  let central = view.getUint32(zip.byteLength - 22 + 16, true);

  for (let index = 0; index < count; index++) {
    const nameLength = view.getUint16(central + 28, true);
    const extraLength = view.getUint16(central + 30, true);
    const commentLength = view.getUint16(central + 32, true);

    if (strFromU8(zip.subarray(central + 46, central + 46 + nameLength)) === name) {
      return { local: view.getUint32(central + 42, true), central };
    }

    central += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error(`No zip entry named ${name}`);
}

function declareSize({
  zip,
  name,
  bytes,
}: {
  zip: Uint8Array;
  name: string;
  bytes: number;
}): Uint8Array {
  const result = zip.slice();
  const view = new DataView(result.buffer);
  const offsets = headerOffsets(result, name);

  view.setUint32(offsets.local + 22, bytes, true);
  view.setUint32(offsets.central + 24, bytes, true);

  return result;
}

export function zipBomb({
  path = 'word/document.xml',
  declaredBytes,
}: {
  path?: string;
  declaredBytes?: number;
} = {}): Uint8Array {
  const zip = zipSync({
    '[Content_Types].xml': strToU8(CONTENT_TYPES),
    [path]: [new Uint8Array(60_000_000).fill(0x20), { level: 9 }],
  });

  if (declaredBytes === undefined) return zip;

  return declareSize({ zip, name: path, bytes: declaredBytes });
}

export function manyEntries(count: number): Uint8Array {
  const files: Zippable = {};

  for (let index = 0; index < count; index++) files[`part${index}.xml`] = strToU8('<a/>');

  return zipSync(files);
}

const OLE_SECTOR_BYTES = 512;

const OLE_ENTRY_BYTES = 128;

const OLE_FREE = 0xffffffff;

const OLE_END_OF_CHAIN = 0xfffffffe;

const OLE_FAT_SECTOR = 0xfffffffd;

function oleFatEntry({ sector, directorySectors }: { sector: number; directorySectors: number }) {
  if (sector === 0) return OLE_FAT_SECTOR;

  if (sector > directorySectors) return OLE_FREE;

  return sector === directorySectors ? OLE_END_OF_CHAIN : sector + 1;
}

export function oleFile({ streams = [] }: { streams?: string[] } = {}): Uint8Array {
  const entries = ['Root Entry', ...streams];
  const directorySectors = Math.ceil(entries.length / (OLE_SECTOR_BYTES / OLE_ENTRY_BYTES));
  const bytes = new Uint8Array(OLE_SECTOR_BYTES * (2 + directorySectors));
  const view = new DataView(bytes.buffer);

  bytes.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  view.setUint16(0x18, 0x3e, true);
  view.setUint16(0x1a, 3, true);
  view.setUint16(0x1c, 0xfffe, true);
  view.setUint16(0x1e, 9, true);
  view.setUint16(0x20, 6, true);
  view.setUint32(0x2c, 1, true);
  view.setUint32(0x30, 1, true);
  view.setUint32(0x38, 4096, true);
  view.setUint32(0x3c, OLE_END_OF_CHAIN, true);
  view.setUint32(0x44, OLE_END_OF_CHAIN, true);

  for (let index = 0; index < 109; index++) {
    view.setUint32(0x4c + index * 4, index === 0 ? 0 : OLE_FREE, true);
  }

  for (let sector = 0; sector < OLE_SECTOR_BYTES / 4; sector++) {
    view.setUint32(OLE_SECTOR_BYTES + sector * 4, oleFatEntry({ sector, directorySectors }), true);
  }

  entries.forEach((name, index) => {
    const offset = OLE_SECTOR_BYTES * 2 + index * OLE_ENTRY_BYTES;

    bytes.set(Buffer.from(name, 'utf16le'), offset);
    view.setUint16(offset + 0x40, (name.length + 1) * 2, true);
    view.setUint8(offset + 0x42, index === 0 ? 5 : 2);
  });

  return bytes;
}

export function encryptedOfficeFile(): Uint8Array {
  return oleFile({ streams: ['EncryptionInfo', 'EncryptedPackage'] });
}

export function streamedZip(files: Record<string, Uint8Array>): Uint8Array {
  const chunks: Uint8Array[] = [];

  const zip = new Zip((error, chunk) => {
    if (error) throw error;

    chunks.push(chunk);
  });

  Object.entries(files).forEach(([name, data]) => {
    const file = new ZipDeflate(name);

    zip.add(file);
    file.push(data, true);
  });

  zip.end();

  return concat(chunks);
}

export function withHiddenEntry({
  zip,
  name,
  data,
}: {
  zip: Uint8Array;
  name: string;
  data: Uint8Array;
}): Uint8Array {
  const hidden = zipSync({ [name]: data });
  const hiddenView = new DataView(hidden.buffer, hidden.byteOffset, hidden.byteLength);
  const hiddenBytes = hiddenView.getUint32(hidden.byteLength - 22 + 16, true);

  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const central = view.getUint32(zip.byteLength - 22 + 16, true);

  const result = concat([
    zip.subarray(0, central),
    hidden.subarray(0, hiddenBytes),
    zip.subarray(central),
  ]);

  new DataView(result.buffer).setUint32(result.byteLength - 22 + 16, central + hiddenBytes, true);

  return result;
}

export function sharedDataEntries({
  zip,
  name,
  copies,
}: {
  zip: Uint8Array;
  name: string;
  copies: number;
}): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const end = zip.byteLength - 22;
  const count = view.getUint16(end + 10, true);
  const centralBytes = view.getUint32(end + 12, true);
  const central = view.getUint32(end + 16, true);
  const record = zip.subarray(headerOffsets(zip, name).central).subarray(0, 46);

  const records = Array.from({ length: copies }, (_, index) => {
    const copyName = strToU8(`copy${index}.xml`);
    const copy = new Uint8Array(46 + copyName.byteLength);
    const copyView = new DataView(copy.buffer);

    copy.set(record);
    copyView.setUint16(28, copyName.byteLength, true);
    copyView.setUint16(30, 0, true);
    copyView.setUint16(32, 0, true);
    copy.set(copyName, 46);

    return copy;
  });

  const added = records.reduce((total, copy) => total + copy.byteLength, 0);

  const result = concat([zip.subarray(0, central + centralBytes), ...records, zip.subarray(end)]);

  const resultView = new DataView(result.buffer);
  const resultEnd = result.byteLength - 22;

  resultView.setUint16(resultEnd + 8, count + copies, true);
  resultView.setUint16(resultEnd + 10, count + copies, true);
  resultView.setUint32(resultEnd + 12, centralBytes + added, true);

  return result;
}

export function withoutUtf8Names(zip: Uint8Array): Uint8Array {
  const result = zip.slice();
  const view = new DataView(result.buffer);
  const count = view.getUint16(result.byteLength - 22 + 10, true);

  let central = view.getUint32(result.byteLength - 22 + 16, true);

  for (let index = 0; index < count; index++) {
    const local = view.getUint32(central + 42, true);

    view.setUint16(central + 8, view.getUint16(central + 8, true) & ~0x800, true);
    view.setUint16(local + 6, view.getUint16(local + 6, true) & ~0x800, true);

    central +=
      46 +
      view.getUint16(central + 28, true) +
      view.getUint16(central + 30, true) +
      view.getUint16(central + 32, true);
  }

  return result;
}

export function storedZip(entries: { name: string; data?: Uint8Array }[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const records: Uint8Array[] = [];

  let offset = 0;

  entries.forEach(({ name, data = new Uint8Array() }) => {
    const nameBytes = strToU8(name);
    const local = new Uint8Array(30 + nameBytes.byteLength);
    const record = new Uint8Array(46 + nameBytes.byteLength);
    const localView = new DataView(local.buffer);
    const recordView = new DataView(record.buffer);
    const checksum = crc32(data);

    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x800, true);
    localView.setUint16(12, 0x21, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, data.byteLength, true);
    localView.setUint32(22, data.byteLength, true);
    localView.setUint16(26, nameBytes.byteLength, true);
    local.set(nameBytes, 30);

    recordView.setUint32(0, 0x02014b50, true);
    recordView.setUint16(4, 20, true);
    recordView.setUint16(6, 20, true);
    recordView.setUint16(8, 0x800, true);
    recordView.setUint16(14, 0x21, true);
    recordView.setUint32(16, checksum, true);
    recordView.setUint32(20, data.byteLength, true);
    recordView.setUint32(24, data.byteLength, true);
    recordView.setUint16(28, nameBytes.byteLength, true);
    recordView.setUint32(42, offset, true);
    record.set(nameBytes, 46);

    locals.push(local, data);
    records.push(record);

    offset += local.byteLength + data.byteLength;
  });

  const central = concat(records);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);

  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, central.byteLength, true);
  endView.setUint32(16, offset, true);

  return concat([...locals, central, end]);
}

export function withTrailingBytes({
  zip,
  bytes,
}: {
  zip: Uint8Array;
  bytes: Uint8Array;
}): Uint8Array {
  return concat([zip, bytes]);
}

export function withCommentDirectory({
  zip,
  hidden,
}: {
  zip: Uint8Array;
  hidden: Uint8Array;
}): Uint8Array {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const central = view.getUint32(zip.byteLength - 22 + 16, true);

  const hiddenView = new DataView(hidden.buffer, hidden.byteOffset, hidden.byteLength);
  const hiddenEnd = hidden.byteLength - 22;
  const hiddenCount = hiddenView.getUint16(hiddenEnd + 10, true);
  const hiddenCentral = hiddenView.getUint32(hiddenEnd + 16, true);
  const hiddenRecords = hidden.slice(hiddenCentral, hiddenEnd);
  const recordsView = new DataView(hiddenRecords.buffer);

  let record = 0;

  for (let index = 0; index < hiddenCount; index++) {
    recordsView.setUint32(record + 42, recordsView.getUint32(record + 42, true) + central, true);

    record +=
      46 +
      recordsView.getUint16(record + 28, true) +
      recordsView.getUint16(record + 30, true) +
      recordsView.getUint16(record + 32, true);
  }

  const directory = zip.slice(central);
  const directoryView = new DataView(directory.buffer);
  const directoryStart = central + hiddenCentral;
  const hiddenEndRecord = hidden.slice(hiddenEnd);

  new DataView(hiddenEndRecord.buffer).setUint32(16, directoryStart + directory.byteLength, true);

  directoryView.setUint32(directory.byteLength - 22 + 16, directoryStart, true);
  directoryView.setUint16(directory.byteLength - 22 + 20, hiddenRecords.byteLength + 22, true);

  return concat([
    zip.subarray(0, central),
    hidden.subarray(0, hiddenCentral),
    directory,
    hiddenRecords,
    hiddenEndRecord,
  ]);
}
