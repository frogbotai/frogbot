export const KNOWN_FLAKY = [
  { test: 'test/browser/richText.browser.spec.ts:21', finding: 'F-037' },
  { test: 'test/browser/richText.browser.spec.ts:391', finding: 'F-038' },
];

const SUMMARY = /^\s*\d+ (?:failed|flaky|skipped|passed|interrupted|did not run)\b/;

const FAILED = /^\s*\d+ failed\s*$/;

const ENTRY = /^\s*\[([^\]]+)\] › (\S+?):(\d+):\d+ › /;

export function failedTests(output) {
  const failed = [];
  let inside = false;

  for (const line of output.split(/\r?\n/)) {
    if (FAILED.test(line)) inside = true;
    else if (SUMMARY.test(line)) inside = false;
    else if (inside) {
      const match = ENTRY.exec(line);

      if (match) failed.push({ project: match[1], test: `${match[2]}:${match[3]}` });
    }
  }

  return failed;
}

export function flakyRetry(output, known = KNOWN_FLAKY) {
  const failed = failedTests(output);

  if (failed.length === 0) return null;

  const found = failed.map((entry) => ({
    ...entry,
    finding: known.find(({ test }) => test === entry.test)?.finding,
  }));

  if (found.some(({ finding }) => !finding)) return null;

  return {
    tests: found,
    args: [
      ...[...new Set(found.map(({ project }) => project))].flatMap((project) => [
        '--project',
        project,
      ]),
      ...new Set(found.map(({ test }) => test)),
    ],
  };
}
