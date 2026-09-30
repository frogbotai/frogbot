import { seoPlugin } from '../../../packages/plugins/plugin-seo/src/index.js';
import { buildTestConfig } from '../../__helpers/shared/buildTestConfig.js';
import { createCollections, generateTitle, mediaSlug, pagesSlug, postsSlug } from '../shared.js';

export default buildTestConfig({
  collections: createCollections(),
  plugins: [
    seoPlugin({
      collections: [postsSlug, pagesSlug],
      uploadsCollection: mediaSlug,
      tabbedUI: true,
      generateTitle,
    }),
  ],
});
