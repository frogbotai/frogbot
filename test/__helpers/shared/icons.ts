import { readdirSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { LucideIcon } from '../../../packages/ui/src/icons/types.js';

export type LoadedIcon = { name: string; Component: LucideIcon };

const iconsDirectory = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../packages/ui/src/icons',
);

const forwardRefType = Symbol.for('react.forward_ref');

const isIcon = (value: unknown): value is LucideIcon =>
  typeof value === 'object' &&
  value !== null &&
  (value as { $$typeof?: symbol }).$$typeof === forwardRefType &&
  (value as { displayName?: string }).displayName !== 'IconBase';

export const excludedIcons: Record<string, number | null> = {
  AmexIcon: 2,
  ArrowDownFilledIcon: 2,
  ArrowUpFilledIcon: 2,
  ChatGptIcon: 0,
  CheckmarkIcon: 0,
  ChromeIcon: 0,
  ClaudeAiIcon: 0,
  DiscoverIcon: 2,
  DropboxIcon: 0,
  FacebookIcon: 1,
  FirmwareFavicon: 0,
  FrogBotFavicon: 0,
  GitHubIcon: 0,
  GoogleGeminiIcon: null,
  GoogleIcon: 0,
  InstagramIcon: 0,
  LinkedInIcon: 2,
  LockIcon: 0,
  MastercardIcon: 2,
  McpIcon: 4.312,
  MicrosoftIcon: 0,
  NotionIcon: 0,
  PawnIcon: 0,
  RedditIcon: 1.5,
  RookIcon: 0,
  SlackIcon: 0,
  StopIcon: 2,
  StripeIcon: 0,
  TwitterIcon: 1,
  VisaIcon: 2,
  XIcon: 0,
  XeroIcon: 0,
  YoutubeIcon: 0,
  ZoomIcon: 0,
};

export const shapeStrokes: Record<string, number> = {
  CursorIcon: 1.5,
  InvalidStepIcon: 0.4,
};

export async function loadIcons(): Promise<LoadedIcon[]> {
  const files = readdirSync(iconsDirectory, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts'))
    .map((file) => join(iconsDirectory, file));

  const seen = new Set<LucideIcon>();
  const loaded: LoadedIcon[] = [];

  for (const file of files) {
    const module: Record<string, unknown> = await import(pathToFileURL(file).href);

    for (const [exportName, value] of Object.entries(module)) {
      if (!isIcon(value) || seen.has(value)) continue;

      seen.add(value);

      loaded.push({
        name: exportName === 'default' ? basename(file, '.ts') : exportName,
        Component: value,
      });
    }
  }

  return loaded.sort((a, b) => a.name.localeCompare(b.name));
}
