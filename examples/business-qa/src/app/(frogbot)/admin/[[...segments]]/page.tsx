import type { Metadata } from 'next';
import config from '@frogbot-config';
import { generatePageMetadata, RootPage } from '@frogbotai/next/views';
import { importMap } from '../importMap.js';

type Args = {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] }>;
};

export const generateMetadata = ({ params, searchParams }: Args): Promise<Metadata> => generatePageMetadata({ config, params, searchParams });

export default function Page({ params, searchParams }: Args) {
  return RootPage({ config, params, searchParams, importMap });
}
