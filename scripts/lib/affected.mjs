const RUNS = [
  { script: 'test:int:sqlite', prefixes: ['packages/'] },
  {
    script: 'test:browser',
    prefixes: ['packages/ui/', 'packages/next/', 'test/browser/', 'templates/blank/'],
  },
];

const DOCS = /\.mdx?$/;

const UNIT_SPEC = /^test\/unit\/(?!gateway\/).*\.spec\.ts$/;

const READS_MARKDOWN = /\.mdx?\b/;

export function affectedRuns(files) {
  return RUNS.filter(({ prefixes }) =>
    files.some((file) => prefixes.some((prefix) => file.startsWith(prefix))),
  ).map(({ script }) => script);
}

export function docsOnly(files) {
  return files.length > 0 && files.every((file) => DOCS.test(file));
}

export function markdownSpecs(specs) {
  return specs
    .filter(({ file, text }) => UNIT_SPEC.test(file) && READS_MARKDOWN.test(text))
    .map(({ file }) => file)
    .sort();
}

export function landGates({ base, files, specs }) {
  if (!docsOnly(files)) return [...base, ...affectedRuns(files)];

  const readers = markdownSpecs(specs);

  return [
    ...base.filter((gate) => !gate.startsWith('test:')),
    ...(readers.length > 0 ? [`test:unit ${readers.join(' ')}`] : []),
  ];
}
