import fs from 'node:fs/promises';
import path from 'node:path';

async function pathOrFileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

export async function resolveImportMapFilePath({
  adminRoute = '/admin',
  importMapFile,
  rootDir,
}: {
  adminRoute?: string;
  importMapFile?: string;
  rootDir: string;
}): Promise<Error | string> {
  let importMapFilePath: string | undefined = undefined;

  if (importMapFile?.length) {
    if (!(await pathOrFileExists(importMapFile))) {
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
    const appLocation = path.resolve(rootDir, `app/(frogbot)${adminRoute}/`);
    const srcAppLocation = path.resolve(rootDir, `src/app/(frogbot)${adminRoute}/`);

    if (appLocation && (await pathOrFileExists(appLocation))) {
      importMapFilePath = path.resolve(appLocation, 'importMap.js');
      if (!(await pathOrFileExists(importMapFilePath))) {
        await fs.writeFile(importMapFilePath, '', { flag: 'wx' });
      }
    } else if (srcAppLocation && (await pathOrFileExists(srcAppLocation))) {
      importMapFilePath = path.resolve(srcAppLocation, 'importMap.js');
      if (!(await pathOrFileExists(importMapFilePath))) {
        await fs.writeFile(importMapFilePath, '', { flag: 'wx' });
      }
    } else {
      return new Error(
        `Could not find the import map folder. Looked in ${appLocation} and ${srcAppLocation}`,
      );
    }
  }
  return importMapFilePath;
}
