import { expectTypeOf } from 'vitest';

import type { RichTextArticle } from '../../rich-text/frogbot-types.js';

declare const article: RichTextArticle;

expectTypeOf(article.content.root.children).toBeArray();
