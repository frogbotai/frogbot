import { getTranslation } from '@payloadcms/translations';
import type { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent';
import type { AdminIcon, FrogBotRequest } from 'frogbot';

export type SettingsEntry = {
  access?: (args: { req: FrogBotRequest }) => boolean | Promise<boolean>;
  Component: Parameters<typeof RenderServerComponent>[0]['Component'];
  icon?: AdminIcon;
  label: string;
  path: string;
};

export function getSettingsRoutePath(segments: readonly string[]): string {
  const settingsSegments = segments[0] === 'settings' ? segments.slice(1) : segments;

  return settingsSegments.join('/');
}

type ResolvedSettingsSection = {
  accessible: SettingsEntry[];
  matched: SettingsEntry | undefined;
  title: string;
};

export async function resolveSettingsSection({
  entries,
  req,
  routePath,
}: {
  entries: readonly SettingsEntry[] | undefined;
  req: FrogBotRequest;
  routePath: string;
}): Promise<ResolvedSettingsSection> {
  const accessible = (
    await Promise.all(
      (entries ?? []).map(async (entry) => ({
        allowed: entry.access ? await entry.access({ req }) : Boolean(req.user),
        entry,
      })),
    )
  )
    .filter(({ allowed }) => allowed)
    .map(({ entry }) => entry);

  const matched = [...accessible]
    .sort((a, b) => b.path.length - a.path.length)
    .find((entry) => routePath === entry.path || routePath.startsWith(`${entry.path}/`));

  const title =
    routePath === 'collections'
      ? 'Collections'
      : matched
        ? getTranslation(matched.label, req.i18n)
        : 'Settings';

  return { accessible, matched, title };
}
