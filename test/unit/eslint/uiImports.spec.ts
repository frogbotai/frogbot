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
    ['58192bd1 @payloadcms/ui outside exports', 'packages/ui/src/chat/link.tsx', PAYLOAD_ROOT, 1],
    ['58192bd1 the root entry in rsc', 'packages/ui/src/exports/rsc/index.ts', PAYLOAD_ROOT, 1],
    ['08c4faee the rsc entry in shared', 'packages/ui/src/exports/shared/index.ts', PAYLOAD_RSC, 1],
    ['an icon library in an exports entry', 'packages/ui/src/exports/client/index.ts', LUCIDE, 1],
  ])('rejects %s', async (_name, filePath, code, count) => {
    expect(await restrictedImports(filePath, code)).toHaveLength(count);
  });

  it.each([
    ['chat code outside components', 'packages/ui/src/exports/chat-artifacts.ts', CHAT],
    ['the root entry in client', 'packages/ui/src/exports/client/index.ts', PAYLOAD_ROOT],
    ['the rsc entry in rsc', 'packages/ui/src/exports/rsc/index.ts', PAYLOAD_RSC],
    ['@payloadcms/ui outside packages/ui', 'packages/next/src/elements/Nav/link.tsx', PAYLOAD_ROOT],
  ])('allows %s', async (_name, filePath, code) => {
    expect(await restrictedImports(filePath, code)).toEqual([]);
  });
});
