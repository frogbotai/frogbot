type OleLayout = {
  view: DataView;
  size: number;
  count: number;
};

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const HEADER_BYTES = 512;

const HEADER_FAT_SECTORS = 109;

const END_OF_CHAIN = 0xfffffffe;

const ENTRY_BYTES = 128;

const MAX_NAME_BYTES = 64;

const STREAM_ENTRY = 2;

export function isOleFile(bytes: Uint8Array): boolean {
  return OLE_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function oleLayout(bytes: Uint8Array): OleLayout | undefined {
  if (bytes.byteLength < HEADER_BYTES) return undefined;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const shift = view.getUint16(0x1e, true);

  if (shift !== 9 && shift !== 12) return undefined;

  const size = 1 << shift;

  return { view, size, count: Math.floor(bytes.byteLength / size) - 1 };
}

function sectorWord({
  layout,
  sector,
  index,
}: {
  layout: OleLayout;
  sector: number;
  index: number;
}): number {
  return layout.view.getUint32((sector + 1) * layout.size + index * 4, true);
}

function* sectorChain({
  layout,
  first,
  next,
}: {
  layout: OleLayout;
  first: number;
  next: (sector: number) => number;
}): Generator<number> {
  let sector = first;

  for (let steps = 0; sector < layout.count && steps < layout.count; steps++) {
    yield sector;

    sector = next(sector);
  }
}

function fatSectors(layout: OleLayout): number[] {
  const words = layout.size / 4;

  const fat = Array.from({ length: HEADER_FAT_SECTORS }, (_, index) =>
    layout.view.getUint32(0x4c + index * 4, true),
  );

  const difat = sectorChain({
    layout,
    first: layout.view.getUint32(0x44, true),
    next: (sector) => sectorWord({ layout, sector, index: words - 1 }),
  });

  for (const sector of difat) {
    for (let index = 0; index < words - 1; index++) fat.push(sectorWord({ layout, sector, index }));
  }

  return fat;
}

export function oleStreamNames(bytes: Uint8Array): string[] {
  const layout = oleLayout(bytes);

  if (!layout) return [];

  const { view, size, count } = layout;
  const words = size / 4;
  const fat = fatSectors(layout);
  const decoder = new TextDecoder('utf-16le');

  const next = (sector: number) => {
    const fatSector = fat[Math.floor(sector / words)];

    if (fatSector === undefined || fatSector >= count) return END_OF_CHAIN;

    return sectorWord({ layout, sector: fatSector, index: sector % words });
  };

  const directory = sectorChain({ layout, first: view.getUint32(0x30, true), next });
  const names: string[] = [];

  for (const sector of directory) {
    for (let entry = (sector + 1) * size; entry < (sector + 2) * size; entry += ENTRY_BYTES) {
      const length = view.getUint16(entry + 0x40, true);

      if (view.getUint8(entry + 0x42) !== STREAM_ENTRY) continue;

      if (length < 2 || length > MAX_NAME_BYTES) continue;

      names.push(decoder.decode(bytes.subarray(entry, entry + length - 2)));
    }
  }

  return names;
}
