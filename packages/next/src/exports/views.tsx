import {
  generatePageMetadata as payloadGeneratePageMetadata,
  NotFoundPage as PayloadNotFoundPage,
  RootPage as PayloadRootPage,
} from '@payloadcms/next/views';
import type { ComponentProps } from 'react';

import { getPayloadConfig } from 'frogbot';

import type { FrogbotConfigArg } from '../types.js';

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

export function generatePageMetadata(args: GeneratePageMetadataArgs): ReturnType<typeof payloadGeneratePageMetadata> {
  const { config, ...rest } = args;
  return payloadGeneratePageMetadata({ ...rest, config: getPayloadConfig(config) });
}
