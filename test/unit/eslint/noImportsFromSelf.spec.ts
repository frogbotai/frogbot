import rule from '../../../scripts/eslint-plugin/rules/no-imports-from-self.mjs';
import { file, ruleTester } from './ruleTester';

ruleTester.run('no-imports-from-self', rule, {
  valid: [
    {
      name: 'a package whose name only starts with the package name',
      code: "import { definePiece } from 'frogbot-piece-http';",
      filename: file('packages/frogbot/src/index.ts'),
    },
    {
      name: 'a scoped package that shares the prefix',
      code: "import { Button } from '@frogbotai/ui-kit';",
      filename: file('packages/ui/src/components/button.tsx'),
    },
    {
      name: 'tests import packages by name',
      code: "import { NavSection } from '@frogbotai/next';",
      filename: file('test/ui/next/elements/Nav/fixtures/consumer/RecentsSection.tsx'),
    },
    {
      name: 'another package imports frogbot',
      code: "import { getPayloadConfig } from 'frogbot/internal';",
      filename: file('packages/graphql/src/bin/generateSchema.ts'),
    },
  ],
  invalid: [
    {
      name: 'ace156ca packages/next/src/elements/Nav/fixtures/consumer/RecentsSection.tsx',
      code: [
        "import { NavSection } from '@frogbotai/next';",
        "import { RecentsSectionClient } from '@frogbotai/next/client';",
      ].join('\n'),
      filename: file('packages/next/src/elements/Nav/fixtures/consumer/RecentsSection.tsx'),
      errors: [
        { messageId: 'self', data: { source: '@frogbotai/next', name: '@frogbotai/next' } },
        { messageId: 'self', data: { source: '@frogbotai/next/client', name: '@frogbotai/next' } },
      ],
    },
    {
      name: '37538837 packages/ui/src/icons/registry.ts',
      code: "import * as icons from '@frogbotai/ui/icons';",
      filename: file('packages/ui/src/icons/registry.ts'),
      errors: [{ messageId: 'self' }],
    },
    {
      name: 'a re-export from the package itself',
      code: "export { getPayloadConfig } from 'frogbot/internal';",
      filename: file('packages/frogbot/src/exports/index.ts'),
      errors: [{ messageId: 'self' }],
    },
  ],
});
