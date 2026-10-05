const RUNS = [
  { script: 'test:int:sqlite', prefixes: ['packages/'] },
  {
    script: 'test:browser',
    prefixes: ['packages/ui/', 'packages/next/', 'test/browser/', 'templates/blank/'],
  },
];

export function affectedRuns(files) {
  return RUNS.filter(({ prefixes }) =>
    files.some((file) => prefixes.some((prefix) => file.startsWith(prefix))),
  ).map(({ script }) => script);
}
