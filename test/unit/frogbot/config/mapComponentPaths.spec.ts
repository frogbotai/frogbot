import type { Block, Config, Field } from 'payload';
import { describe, expect, it, vi } from 'vitest';

import { mapComponentPaths } from '../../../../packages/frogbot/src/config/rewriteComponentPaths.js';

const db: Config['db'] = {
  defaultIDType: 'number',
  init: () => {
    throw new Error('unused');
  },
  name: 'test',
};

function makeConfig(config: Omit<Config, 'db' | 'secret'>): Config {
  return { db, secret: 'test', ...config };
}

function mark(path: string): string {
  return path.startsWith('pkg/') ? path.replace('pkg/', 'mapped/') : path;
}

function fieldWith(name: string, path: string): Field {
  return { name, type: 'text', admin: { components: { Field: path } } };
}

describe('mapComponentPaths', () => {
  it('maps string paths and returns the same config', () => {
    const config = makeConfig({
      admin: { components: { beforeLogin: ['pkg/client#Login', './Local#Local'] } },
    });

    const result = mapComponentPaths(config, mark);

    expect(result).toBe(config);
    expect(config.admin?.components?.beforeLogin).toEqual(['mapped/client#Login', './Local#Local']);
  });

  it('passes exportName to map and keeps the rest of the component', () => {
    const map = vi.fn(mark);
    const config = makeConfig({
      admin: {
        components: {
          providers: [{ path: 'pkg/rsc', exportName: 'Provider', clientProps: { a: 1 } }],
        },
      },
    });

    mapComponentPaths(config, map);

    expect(map).toHaveBeenCalledWith('pkg/rsc', 'Provider');
    expect(config.admin?.components?.providers).toEqual([
      { path: 'mapped/rsc', exportName: 'Provider', clientProps: { a: 1 } },
    ]);
  });

  it('maps admin.dependencies keys without an exportName', () => {
    const map = vi.fn(mark);
    const config = makeConfig({
      admin: {
        dependencies: {
          'pkg/client#Handler': { type: 'function', path: 'pkg/client#Handler' },
        },
      },
    });

    mapComponentPaths(config, map);

    expect(map).toHaveBeenCalledWith('pkg/client#Handler');
    expect(config.admin?.dependencies).toEqual({
      'mapped/client#Handler': { type: 'function', path: 'mapped/client#Handler' },
    });
  });

  it('maps fields in tabs, groups and blocks, and config.blocks, in place', () => {
    const tabField = fieldWith('tabbed', 'pkg/client#Tab');
    const groupField = fieldWith('grouped', 'pkg/client#Group');
    const blockField = fieldWith('blocked', 'pkg/client#Block');
    const block: Block = { slug: 'hero', fields: [blockField] };
    const rootBlock: Block = {
      slug: 'cta',
      admin: { components: { Block: 'pkg/client#Cta' } },
      fields: [],
    };

    const config = makeConfig({
      blocks: [rootBlock],
      collections: [
        {
          slug: 'posts',
          admin: { components: { beforeList: ['pkg/client#BeforeList'] } },
          fields: [
            { type: 'tabs', tabs: [{ label: 'One', fields: [tabField] }] },
            { name: 'group', type: 'group', fields: [groupField] },
            { name: 'layout', type: 'blocks', blocks: [block] },
          ],
        },
      ],
    });

    mapComponentPaths(config, mark);

    expect(tabField.admin?.components).toEqual({ Field: 'mapped/client#Tab' });
    expect(groupField.admin?.components).toEqual({ Field: 'mapped/client#Group' });
    expect(blockField.admin?.components).toEqual({ Field: 'mapped/client#Block' });
    expect(rootBlock.admin?.components).toEqual({ Block: 'mapped/client#Cta' });
    expect(config.collections?.[0]?.admin?.components?.beforeList).toEqual([
      'mapped/client#BeforeList',
    ]);
  });
});
