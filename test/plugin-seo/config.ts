import { seoPlugin } from '@frogbotai/plugin-seo';

import { buildTestConfig } from '../__helpers/shared/buildTestConfig.js';
import { createCollections, generateTitle, mediaSlug, pagesSlug, postsSlug } from './shared.js';

export default buildTestConfig({
  collections: createCollections(),
  plugins: [
    seoPlugin({
      collections: [postsSlug, pagesSlug],
      uploadsCollection: mediaSlug,
      generateTitle,
    }),
  ],
});
