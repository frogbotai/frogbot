import rule from '../../../scripts/eslint-plugin/rules/no-imports-from-exports-dir.mjs';
import { file, ruleTester } from './ruleTester';

ruleTester.run('no-imports-from-exports-dir', rule, {
  valid: [
    {
      name: 'the exports layer may re-export another exports file (packages/ui/src/index.ts)',
      code: "export * from './exports/client/index.js';",
      filename: file('packages/ui/src/index.ts'),
    },
    {
      name: 'a path that only contains an exports segment',
      code: "import { icons } from '../../../../packages/ui/src/exports/icons';",
      filename: file('test/ui/ui/icons/icons.spec.tsx'),
    },
    {
      name: 'a module whose name starts with exports',
      code: "import { list } from './exportsList.js';",
      filename: file('packages/frogbot/src/index.ts'),
    },
  ],
  invalid: [
    {
      name: 'be97e6ad packages/graphql/src/bin/index.ts',
      code: "import { generateSchema } from '../exports/utilities.js';",
      filename: file('packages/graphql/src/bin/index.ts'),
      errors: [{ messageId: 'exportsDir', data: { source: '../exports/utilities.js' } }],
    },
    {
      name: '7fa96a0a packages/ui/src/icons/registry.ts',
      code: "import * as icons from '../exports/icons.js';",
      filename: file('packages/ui/src/icons/registry.ts'),
      errors: [{ messageId: 'exportsDir' }],
    },
    {
      name: 'a type import from a sibling exports directory',
      code: "import type { FieldType } from './exports/client/index.js';",
      filename: file('packages/ui/src/index.ts'),
      errors: [{ messageId: 'exportsDir' }],
    },
    {
      name: 'a dynamic import',
      code: "const icons = await import('../exports/icons.js');",
      filename: file('packages/ui/src/icons/registry.ts'),
      errors: [{ messageId: 'exportsDir' }],
    },
  ],
});
