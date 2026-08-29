import path from 'node:path';

export function getImportMapToBaseDirPath({
  baseDir,
  importMapPath,
}: {
  baseDir: string;
  importMapPath: string;
}): string {
  const importMapDir = path.dirname(importMapPath);

  let relativePath = path.relative(importMapDir, baseDir).replace(/\\/g, '/');

  if (!relativePath) {
    relativePath = './';
  } else if (!relativePath.startsWith('.') && !relativePath.startsWith('/')) {
    relativePath = `./${relativePath}`;
  }

  if (!relativePath.endsWith('/')) {
    relativePath += '/';
  }

  return relativePath;
}
