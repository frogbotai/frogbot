import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { file, root } from './ruleTester';

const eslint = new ESLint({ cwd: root });

const CLASS_NAMES =
  "import { type ClassValue, clsx } from 'clsx';\nimport { twMerge } from 'tailwind-merge';";

const LUCIDE = "export { Bot as BotIcon } from 'lucide-react';";

const CHAT = "export type { ArtifactContextValue } from '../chat/artifact.js';";

const ADMIN = "import { NavSection } from '@frogbotai/next';";

const PAYLOAD_ROOT = "import { Link, useConfig } from '@payloadcms/ui';";

const PAYLOAD_RSC = "import { getColumns, renderTable } from '@payloadcms/ui/rsc';";

const NEXT_NAVIGATION = "import { usePathname } from 'next/navigation';";

const PAYLOAD_NEXT = "import { RootLayout } from '@payloadcms/next/layouts';";

const FROGBOT_NEXT = "import { RootLayout } from '@frogbotai/next/layouts';";

const ADMIN_ENTRY = "export * from './admin/exports/client.js';";

const PAYLOAD_TYPES = "import type { SanitizedConfig } from 'payload';";

async function restrictedImports(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: file(filePath) });

  return result.messages
    .filter((message) => message.ruleId === 'no-restricted-imports')
    .map((message) => message.message);
}

describe('packages/ui import boundaries', () => {
  it.each([
    ['ace156ca clsx and tailwind-merge', 'packages/ui/src/lib/utils.ts', CLASS_NAMES, 2],
    ['39931f26 lucide-react', 'packages/ui/src/exports/icons.ts', LUCIDE, 1],
    ['b90c7f1a chat code in a component', 'packages/ui/src/components/artifact.tsx', CHAT, 1],
    ['ace156ca admin code in a component', 'packages/ui/src/components/nav.tsx', ADMIN, 1],
    ['@payloadcms/ui in chat', 'packages/ui/src/chat/use-chat.ts', PAYLOAD_ROOT, 1],
    ['@payloadcms/ui in a component', 'packages/ui/src/components/link.tsx', PAYLOAD_ROOT, 1],
    ['payload outside admin', 'packages/ui/src/chat/use-chat.ts', PAYLOAD_TYPES, 1],
    ['next outside admin', 'packages/ui/src/theme/provider.tsx', NEXT_NAVIGATION, 1],
    ['an admin import in the root', 'packages/ui/src/index.ts', ADMIN_ENTRY, 1],
    [
      'next/navigation in an admin view',
      'packages/ui/src/admin/views/Board/index.tsx',
      NEXT_NAVIGATION,
      1,
    ],
    ['@payloadcms/next in admin', 'packages/ui/src/admin/exports/rsc.ts', PAYLOAD_NEXT, 1],
    ['@frogbotai/next in admin', 'packages/ui/src/admin/elements/Nav/index.tsx', FROGBOT_NEXT, 1],
    ['an icon library in an admin entry', 'packages/ui/src/admin/exports/client.ts', LUCIDE, 1],
  ])('rejects %s', async (_name, filePath, code, count) => {
    expect(await restrictedImports(filePath, code)).toHaveLength(count);
  });

  it.each([
    ['chat code outside components', 'packages/ui/src/exports/chat-artifacts.ts', CHAT],
    ['the root entry in admin', 'packages/ui/src/admin/exports/client.ts', PAYLOAD_ROOT],
    ['the rsc entry in admin', 'packages/ui/src/admin/exports/rsc.ts', PAYLOAD_RSC],
    ['payload types in admin', 'packages/ui/src/admin/views/Board/index.tsx', PAYLOAD_TYPES],
    ['@payloadcms/ui outside packages/ui', 'packages/next/src/elements/Nav/link.tsx', PAYLOAD_ROOT],
  ])('allows %s', async (_name, filePath, code) => {
    expect(await restrictedImports(filePath, code)).toEqual([]);
  });
});
