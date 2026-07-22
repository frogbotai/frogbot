import {
  generatePageMetadata as payloadGeneratePageMetadata,
  NotFoundPage as PayloadNotFoundPage,
  RootPage as PayloadRootPage,
} from '@payloadcms/next/views';
import type { ComponentProps } from 'react';

import { getPayloadConfig } from 'frogbot';

import frogbotFavicon from '../assets/frogbot-favicon.png';
import frogbotOGImage from '../assets/frogbot-og.jpg';
import type { FrogbotConfigArg } from '../types.js';

const assetURL = (asset: { src: string } | string): string =>
  typeof asset === 'object' ? asset.src : asset;

type RootPageProps = Omit<ComponentProps<typeof PayloadRootPage>, 'config'> & {
  readonly config: FrogbotConfigArg;
};

export function RootPage({ config, ...rest }: RootPageProps) {
  return <PayloadRootPage {...rest} config={getPayloadConfig(config)} />;
}

type NotFoundPageProps = Omit<ComponentProps<typeof PayloadNotFoundPage>, 'config'> & {
  readonly config: FrogbotConfigArg;
};

export function NotFoundPage({ config, ...rest }: NotFoundPageProps) {
  return <PayloadNotFoundPage {...rest} config={getPayloadConfig(config)} />;
}

type GeneratePageMetadataArgs = Omit<Parameters<typeof payloadGeneratePageMetadata>[0], 'config'> & {
  config: FrogbotConfigArg;
};

export async function generatePageMetadata(
  args: GeneratePageMetadataArgs,
): ReturnType<typeof payloadGeneratePageMetadata> {
  const { config, ...rest } = args;
  const payloadConfig = getPayloadConfig(config);
  const metadata = await payloadGeneratePageMetadata({ ...rest, config: payloadConfig });
  const meta = (await payloadConfig).admin?.meta;

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
