import { ConfigIssueError } from './issue.js';
import type { FrogBotConfig } from './types.js';

const DOCS = 'https://docs.frogbot.ai/upload/overview#image-sizes';

const TRANSFORMER_OPTIONS: Record<string, string> = {
  constructorOptions: 'constructorOptions',
  formatOptions: 'formatOptions',
  imageSizes: 'variants',
  resizeOptions: 'resizeOptions',
  trimOptions: 'trimOptions',
  variants: 'variants',
  withMetadata: 'withMetadata',
};

type Misplaced = { slug: string; options: string[] };

function misplacedOptions(config: FrogBotConfig): Misplaced[] {
  return config.collections.flatMap(({ slug, upload }) => {
    if (typeof upload !== 'object' || upload === null) return [];

    const options = Object.keys(TRANSFORMER_OPTIONS).filter((option) => option in upload);

    return options.length ? [{ slug, options }] : [];
  });
}

function snippet(misplaced: Misplaced[]): string {
  const collections = misplaced.map(({ slug, options }) => {
    const moved = new Set(options.map((option) => `${TRANSFORMER_OPTIONS[option]}: ...`));

    return `${JSON.stringify(slug)}: { ${[...moved].join(', ')} }`;
  });

  return `upload: { transformers: [sharpTransformer({ collections: { ${collections.join(', ')} } })] }`;
}

function problem({ slug, options }: Misplaced): string {
  const names = options.map((option) => `\`upload.${option}\``).join(', ');

  return `Collection "${slug}" sets ${names}, which FrogBot reads only from the sharp transformer.`;
}

/**
 * Image options belong to `sharpTransformer` from `@frogbotai/transformer-sharp`, under
 * `upload.transformers`. Set on a collection or as a top-level `sharp`, they would be ignored,
 * so the config is refused with the FrogBot snippet that replaces them.
 */
export function assertUploadOptions(config: FrogBotConfig): void {
  const misplaced = misplacedOptions(config);
  const topLevel = 'sharp' in config;

  if (!misplaced.length && !topLevel) return;

  const first = misplaced[0];
  const problems = [
    ...(topLevel ? ['The top-level `sharp` option is not a FrogBot option.'] : []),
    ...misplaced.map(problem),
  ];

  const fix = first
    ? `Use \`${snippet(misplaced)}\`, with \`sharpTransformer\` from \`@frogbotai/transformer-sharp\`.`
    : 'Add `sharpTransformer()` from `@frogbotai/transformer-sharp` to `upload.transformers` instead.';

  throw new ConfigIssueError({
    code: 'UPLOAD_OPTION_MISPLACED',
    message: `[frogbot] ${problems.join(' ')} ${fix} See ${DOCS}`,
    path: first ? `collections.${first.slug}.upload.${first.options[0]}` : 'sharp',
  });
}
