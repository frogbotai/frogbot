import fs from 'node:fs/promises';
import path from 'node:path';

import { NEXT_ROUTE_GROUP } from '../frameworkConventions.js';

async function pathOrFileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);

    return true;
  } catch {
    return false;
  }
}

const defaultCandidateDirectories = (rootDir: string, adminRoute: string): string[] => [
  path.resolve(rootDir, `app/${NEXT_ROUTE_GROUP}${adminRoute}/`),
  path.resolve(rootDir, `src/app/${NEXT_ROUTE_GROUP}${adminRoute}/`),
];

export async function resolveImportMapFilePath({
  adminRoute = '/',
  candidateDirectories,
  create = true,
  importMapFile,
  rootDir,
}: {
  adminRoute?: string;
  candidateDirectories?: string[];
  create?: boolean;
  importMapFile?: string;
  rootDir: string;
}): Promise<Error | string> {
  let importMapFilePath: string | undefined = undefined;

  if (importMapFile?.length) {
    if (create && !(await pathOrFileExists(importMapFile))) {
      try {
        await fs.writeFile(importMapFile, '', { flag: 'wx' });
      } catch (err) {
        return new Error(
          `Could not find the import map file at ${importMapFile}${err instanceof Error && err?.message ? `: ${err.message}` : ''}`,
        );
      }
    }

    importMapFilePath = importMapFile;
  } else {
    const directories = candidateDirectories ?? defaultCandidateDirectories(rootDir, adminRoute);

    for (const dir of directories) {
      if (await pathOrFileExists(dir)) {
        importMapFilePath = path.resolve(dir, 'importMap.js');

        if (create && !(await pathOrFileExists(importMapFilePath))) {
          await fs.writeFile(importMapFilePath, '', { flag: 'wx' });
        }

        break;
      }
    }

    if (!importMapFilePath) {
      return new Error(
        `Could not find the import map folder. Looked in ${directories.join(' and ')}`,
      );
    }
  }

  return importMapFilePath;
}
