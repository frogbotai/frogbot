import rule from '../../../scripts/eslint-plugin/rules/client-imports.mjs';
import { file, ruleTester } from './ruleTester';

const filename = file('packages/next/src/elements/Nav/AppSidebar.tsx');

ruleTester.run('client-imports', rule, {
  valid: [
    {
      name: 'the root @payloadcms/ui entry in a client file',
      code: "'use client';\nimport { Tooltip } from '@payloadcms/ui';",
      filename,
    },
    {
      name: 'c8419043 server files may import Payload UI subpaths',
      code: "import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';",
      filename: file('packages/next/src/elements/Nav/index.tsx'),
    },
    {
      name: 'a use client string that is not a directive',
      code: "const mode = 'use client';\nimport { getColumns } from '@payloadcms/ui/rsc';",
      filename,
    },
    {
      name: 'type-only imports are erased',
      code: "'use client';\nimport type { Stats } from 'node:fs';\nexport type { ServerProps } from '@frogbotai/next/rsc';",
      filename,
    },
    {
      name: 'a module whose name contains rsc',
      code: "'use client';\nimport { parse } from './rscPayload.js';",
      filename,
    },
  ],
  invalid: [
    {
      name: 'c8419043 packages/next/src/elements/Nav/AppSidebar.tsx',
      code: [
        "'use client';",
        '',
        "import { FolderIcon, FrogBotFavicon, SidebarLeftIcon } from '@frogbotai/ui/icons';",
        "import { Tooltip } from '@payloadcms/ui/elements/Tooltip';",
      ].join('\n'),
      filename,
      errors: [
        { messageId: 'payloadSubpath', data: { source: '@payloadcms/ui/elements/Tooltip' } },
      ],
    },
    {
      name: '08c4faee packages/next/src/views/Calendar/index.tsx import in a client file',
      code: "'use client';\nimport { getColumns, renderTable } from '@payloadcms/ui/rsc';",
      filename,
      errors: [{ messageId: 'rsc', data: { source: '@payloadcms/ui/rsc' } }],
    },
    {
      name: 'd45e2c40 packages/next/src/withFrogbot.ts import in a client file',
      code: "'use client';\nimport { createRequire } from 'node:module';",
      filename,
      errors: [{ messageId: 'node', data: { source: 'node:module' } }],
    },
    {
      name: 'rsc entry points by relative path, re-export and dynamic import',
      code: [
        '"use strict";',
        "'use client';",
        "import { Table } from '../../exports/rsc/index.js';",
        "export * from '../exports/rsc.js';",
        "const icons = import('@payloadcms/ui/icons/Chevron');",
      ].join('\n'),
      filename,
      errors: [{ messageId: 'rsc' }, { messageId: 'rsc' }, { messageId: 'payloadSubpath' }],
    },
  ],
});
