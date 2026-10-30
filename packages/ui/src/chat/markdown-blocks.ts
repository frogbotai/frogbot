import MarkdownIt from 'markdown-it';

const parser = new MarkdownIt({ html: true });

/**
 * `text` split into its top-level markdown blocks, so a streaming reply re-parses only the block
 * still growing. Text with a reference definition stays whole: a definition serves every block.
 */
export function markdownBlocks(text: string): string[] {
  const env: { references?: Record<string, unknown> } = {};

  const starts = parser
    .parse(text, env)
    .flatMap((token) =>
      token.level === 0 && token.nesting !== -1 && token.map ? token.map[0] : [],
    );

  if (starts.length < 2 || Object.keys(env.references ?? {}).length > 0) return [text];

  const lines = text.split('\n');

  return starts.map((start, index) =>
    lines.slice(index === 0 ? 0 : start, starts[index + 1] ?? lines.length).join('\n'),
  );
}
