export const KNOWN_FLAKY = [
  {
    file: 'test/browser/richText.browser.spec.ts',
    title: 'edits, saves, reloads, and renders rich text through the generated import map',
    finding: 'F-037',
  },
  {
    file: 'test/browser/richText.browser.spec.ts',
    title: 'view selection preserves saved content and safely renders editor nodes',
    finding: 'F-038',
  },
  {
    file: 'test/browser/modelSelector.browser.spec.ts',
    title: 'typing sonnet filters about 500 models within 100 ms per key',
    finding: 'F-169',
  },
];

const SUMMARY = /^\s*\d+ (?:failed|flaky|skipped|passed|interrupted|did not run)\b/;

const FAILED = /^\s*\d+ failed\s*$/;

const ENTRY = /^\s*\[([^\]]+)\] › (\S+?):(\d+):\d+ › (.*?)\s*$/;

export function failedTests(output) {
  const failed = [];
  let inside = false;

  for (const line of output.split(/\r?\n/)) {
    if (FAILED.test(line)) inside = true;
    else if (SUMMARY.test(line)) inside = false;
    else if (inside) {
      const match = ENTRY.exec(line);

      if (match) {
        failed.push({ project: match[1], test: `${match[2]}:${match[3]}`, title: match[4] });
      }
    }
  }

  return failed;
}

export function flakyRetry(output, known = KNOWN_FLAKY) {
  const failed = failedTests(output);

  if (failed.length === 0) return null;

  const found = failed.map(({ title, ...entry }) => ({
    ...entry,
    finding: known.find(
      (flaky) => entry.test.startsWith(`${flaky.file}:`) && title.startsWith(flaky.title),
    )?.finding,
  }));

  if (found.some(({ finding }) => !finding)) return null;

  return {
    tests: found,
    args: [
      ...new Set(found.map(({ test }) => test)),
      ...[...new Set(found.map(({ project }) => project))].map((project) => `--project=${project}`),
    ],
  };
}
