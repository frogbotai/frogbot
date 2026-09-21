import config from '@frogbot-config';
import { getFrogbot } from 'frogbot';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { pagesSlug } from '../../../../shared';
import { PageClient } from './page.client';

type Args = {
  params: Promise<{ slug: string }>;
};

export default async function Page({ params }: Args) {
  const { slug } = await params;
  const frogbot = await getFrogbot({ config });
  const requestHeaders = await headers();
  const { user } = await frogbot.auth({ headers: requestHeaders });

  if (!user) {
    notFound();
  }

  const req = await frogbot.createRequest({ headers: requestHeaders, user });
  const result = await frogbot.find({
    collection: pagesSlug,
    where: { slug: { equals: slug } },
    draft: true,
    depth: 0,
    limit: 1,
    req,
    overrideAccess: false,
  });
  const page = result.docs[0];

  if (!page) {
    notFound();
  }

  return <PageClient page={page} />;
}
