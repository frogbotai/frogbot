import {
  generatePageMetadata as payloadGeneratePageMetadata,
  NotFoundPage as PayloadNotFoundPage,
  RootPage as PayloadRootPage,
} from '@payloadcms/next/views';
import { getPayloadConfig } from 'frogbot/internal';
import type { ComponentProps } from 'react';

import frogbotFavicon from '../assets/frogbot-favicon.png';
import frogbotOGImage from '../assets/frogbot-og.jpg';
import type { FrogBotConfigArg } from '../types.js';
import { brandImportMapErrors } from '../utilities/brandImportMapErrors.js';
import { getSettingsTitle } from '../views/Settings/metadata.js';

brandImportMapErrors();

const assetURL = (asset: { src: string } | string): string =>
  typeof asset === 'object' ? asset.src : asset;

type RootPageProps = Omit<ComponentProps<typeof PayloadRootPage>, 'config'> & {
  readonly config: FrogBotConfigArg;
};

export function RootPage({ config, ...rest }: RootPageProps) {
  return <PayloadRootPage {...rest} config={getPayloadConfig(config)} />;
}

type NotFoundPageProps = Omit<ComponentProps<typeof PayloadNotFoundPage>, 'config'> & {
  readonly config: FrogBotConfigArg;
};

export function NotFoundPage({ config, ...rest }: NotFoundPageProps) {
  return <PayloadNotFoundPage {...rest} config={getPayloadConfig(config)} />;
}

type GeneratePageMetadataArgs = Omit<
  Parameters<typeof payloadGeneratePageMetadata>[0],
  'config'
> & {
  config: FrogBotConfigArg;
};

export async function generatePageMetadata(
  args: GeneratePageMetadataArgs,
): ReturnType<typeof payloadGeneratePageMetadata> {
  const { config, ...rest } = args;
  const payloadConfig = getPayloadConfig(config);
  const metadata = await payloadGeneratePageMetadata({ ...rest, config: payloadConfig });
  const resolvedConfig = await payloadConfig;
  const meta = resolvedConfig.admin?.meta;

  const params = await args.params;
  const settingsTitle = await getSettingsTitle({
    config: resolvedConfig,
    segments: Array.isArray(params.segments) ? params.segments : [],
  });

  if (settingsTitle !== undefined) {
    const suffix = meta?.titleSuffix;

    metadata.title = suffix ? `${settingsTitle} ${suffix}` : settingsTitle;
    metadata.description = settingsTitle;
    metadata.keywords = settingsTitle;
    metadata.openGraph = { ...metadata.openGraph, title: settingsTitle };
  }

  if (!meta?.icons) {
    metadata.icons = [
      { rel: 'icon', sizes: '32x32', type: 'image/png', url: assetURL(frogbotFavicon) },
    ];
  }

  if (meta?.defaultOGImageType === 'static' && !meta?.openGraph?.images) {
    metadata.openGraph = {
      ...metadata.openGraph,
      images: [{ alt: 'FrogBot', height: 630, url: assetURL(frogbotOGImage), width: 1200 }],
    };
  }

  return metadata;
}
