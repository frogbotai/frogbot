import type { Metadata } from 'next';

import config from '@frogbot-config';
import { generatePageMetadata, NotFoundPage } from '@frogbotai/next/views';

import { importMap } from '../importMap.js';

type Args = {
  params: Promise<{
    segments: string[];
  }>;
  searchParams: Promise<{
    [key: string]: string | string[];
  }>;
};

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> =>
  generatePageMetadata({ config, params, searchParams });

const NotFound = ({ params, searchParams }: Args) => NotFoundPage({ config, params, searchParams, importMap });

export default NotFound;
