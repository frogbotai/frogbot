import { describe, expect, it, vi } from 'vitest';

vi.mock('frogbot/pieces', () => import('../../../packages/frogbot/src/pieces/definePiece.js'));

import { pieceFactoryDefinition } from '../../../packages/frogbot/src/pieces/definePiece.js';
import { createXml } from '../../../packages/pieces/piece-xml/src/index.js';

const xml = createXml();
const req = {} as never;

describe('xml declaration', () => {
  it('registers every upstream action under a semantic name', () => {
    const definition = pieceFactoryDefinition(createXml);

    expect(definition.actions.map(({ slug }) => slug)).toEqual([
      'convertJsonToXml',
      'convertXmlToJson',
    ]);
    expect(xml.convertJsonToXml).toBeTypeOf('function');
    expect(xml.convertXmlToJson).toBeTypeOf('function');
  });
});

describe('convertJsonToXml', () => {
  it('converts nested values and arrays with the default attribute field', async () => {
    const result = await xml.convertJsonToXml({
      input: {
        json: {
          catalog: {
            attr: { id: '42' },
            enabled: true,
            item: ['frog', 'toad'],
          },
        },
      },
      req,
    });

    expect(result).toBe(
      '<catalog><enabled id="42">true</enabled><item id="42">frogtoad</item></catalog>',
    );
  });

  it('uses a custom attribute field and includes the optional header', async () => {
    const result = await xml.convertJsonToXml({
      input: {
        json: { frog: { attributes: { kind: 'tree' }, name: 'Cope' } },
        attributesKey: 'attributes',
        header: true,
      },
      req,
    });

    expect(result).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><frog><name kind="tree">Cope</name></frog>',
    );
  });

  it('surfaces invalid root values as conversion failures', async () => {
    await expect(xml.convertJsonToXml({ input: { json: null }, req })).rejects.toThrow();
  });
});

describe('convertXmlToJson', () => {
  it('ignores declarations and preserves attributes by default', async () => {
    const result = await xml.convertXmlToJson({
      input: {
        xml: '<?xml version="1.0"?><frog id="42"><enabled>true</enabled><count>3</count></frog>',
      },
      req,
    });

    expect(result).toEqual({ frog: { enabled: true, count: 3, '@_id': '42' } });
  });

  it('can omit attributes and preserves repeated elements as arrays', async () => {
    const result = await xml.convertXmlToJson({
      input: {
        xml: '<pond id="7"><frog>green</frog><frog>gold</frog></pond>',
        ignoreAttributes: true,
      },
      req,
    });

    expect(result).toEqual({ pond: { frog: ['green', 'gold'] } });
  });
});
