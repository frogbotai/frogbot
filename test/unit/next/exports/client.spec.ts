import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const source = await readFile(
  new URL('../../../../packages/next/src/exports/client.ts', import.meta.url),
  'utf8',
);

describe('@frogbotai/next client export', () => {
  it('does not create a wildcard client boundary', () => {
    expect(source).not.toContain("'use client'");
  });

  it('forwards the Payload client exports', () => {
    expect(source).toContain("export * from '@payloadcms/next/client'");
  });

  it('exports the channel list cell', () => {
    expect(source).toContain(
      "export { ChannelCell, type ChannelCellProps } from '../fields/Channel/index.client.js'",
    );
  });

  it('exports the AI cell and field', () => {
    expect(source).toContain("export { AICell, AIField } from '../fields/AI/index.client.js'");
  });

  it('exports the field cell', () => {
    expect(source).toContain("export { FieldCell } from '../fields/FieldCell/index.client.js'");
  });

  it('exports the money cell and field', () => {
    expect(source).toContain(
      "export { MoneyCell, MoneyField } from '../fields/Money/index.client.js'",
    );
  });

  it.each([
    ['BarcodeCell', 'Barcode'],
    ['UrlCell', 'Url'],
  ])('exports the %s kind cell', (name, folder) => {
    expect(source).toContain(`export { ${name} } from '../fields/${folder}/index.client.js'`);
  });

  it.each([
    ['DurationCell, DurationField', 'Duration'],
    ['PercentCell, PercentField', 'Percent'],
    ['PhoneCell, PhoneField', 'Phone'],
    ['RatingCell, RatingField', 'Rating'],
  ])('exports the %s kind cell and field', (names, folder) => {
    expect(source).toContain(`export { ${names} } from '../fields/${folder}/index.client.js'`);
  });

  it('does not export the CostUSD components', () => {
    expect(source).not.toContain('CostUSD');
  });
});
