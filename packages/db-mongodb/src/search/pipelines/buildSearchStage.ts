export function buildSearchStage({
  filter,
  name,
  paths,
  text,
}: {
  filter?: Record<string, unknown>;
  name: string;
  paths: string[];
  text: string;
}): Record<string, unknown> {
  return {
    $search: {
      index: name,
      compound: {
        must: [{ text: { query: text, path: paths } }],
        ...(filter ? { filter: [filter] } : {}),
      },
    },
  };
}
