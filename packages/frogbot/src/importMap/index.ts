import fs from 'node:fs/promises';
import process from 'node:process';

import type { PayloadComponent, SanitizedConfig } from 'payload';

import { iterateConfig } from './iterateConfig.js';
import { addPayloadComponentToImportMap } from './utilities/addPayloadComponentToImportMap.js';
import { getImportMapToBaseDirPath } from './utilities/getImportMapToBaseDirPath.js';
import { resolveImportMapFilePath } from './utilities/resolveImportMapFilePath.js';

export type InternalImportMap = {
  [path: string]: string;
};

export type Imports = {
  [identifier: string]: {
    path: string;
    specifier: string;
  };
};

export type AddToImportMap = (payloadComponent?: PayloadComponent | PayloadComponent[]) => void;

export async function generateImportMap(
  config: SanitizedConfig,
  options?: {
    force?: boolean;
    ignoreResolveError?: boolean;
  },
): Promise<{ changed: boolean; outputPath: string } | null> {
  const importMap: InternalImportMap = {};
  const imports: Imports = {};

  const rootDir = process.env.ROOT_DIR ?? process.cwd();
  const baseDir = config.admin.importMap.baseDir ?? process.cwd();

  const importMapFilePath = await resolveImportMapFilePath({
    adminRoute: config.routes.admin,
    importMapFile: config?.admin?.importMap?.importMapFile,
    rootDir,
  });

  if (importMapFilePath instanceof Error) {
    if (options?.ignoreResolveError) {
      return null;
    }
    throw importMapFilePath;
  }

  const importMapToBaseDirPath = getImportMapToBaseDirPath({
    baseDir,
    importMapPath: importMapFilePath,
  });

  const addToImportMap: AddToImportMap = (payloadComponent) => {
    if (!payloadComponent) {
      return;
    }

    if (typeof payloadComponent !== 'object' && typeof payloadComponent !== 'string') {
      throw new Error('[frogbot] addToImportMap > component must be an object or a string');
    }

    if (Array.isArray(payloadComponent)) {
      for (const component of payloadComponent) {
        addPayloadComponentToImportMap({
          importMap,
          importMapToBaseDirPath,
          imports,
          payloadComponent: component,
        });
      }
    } else {
      addPayloadComponentToImportMap({
        importMap,
        importMapToBaseDirPath,
        imports,
        payloadComponent,
      });
    }
  };

  iterateConfig({
    addToImportMap,
    baseDir,
    config,
    importMap,
    imports,
  });

  const changed = await writeImportMap({
    componentMap: importMap,
    force: options?.force,
    importMap: imports,
    importMapFilePath,
  });

  return { changed, outputPath: importMapFilePath };
}

export async function writeImportMap({
  componentMap,
  force,
  importMap,
  importMapFilePath,
}: {
  componentMap: InternalImportMap;
  force?: boolean;
  importMap: Imports;
  importMapFilePath: string;
}): Promise<boolean> {
  const imports: string[] = [];
  for (const [identifier, { path, specifier }] of Object.entries(importMap)) {
    imports.push(`import { ${specifier} as ${identifier} } from '${path}'`);
  }

  const mapKeys: string[] = [];
  for (const [userPath, identifier] of Object.entries(componentMap)) {
    mapKeys.push(`  "${userPath}": ${identifier}`);
  }

  const importMapOutputFile = `${imports.join('\n')}

/** @type import('frogbot').ImportMap */
export const importMap = {
${mapKeys.join(',\n')}
}
`;

  if (!force) {
    const currentImportMap = await fs.readFile(importMapFilePath, 'utf-8');

    if (currentImportMap?.trim() === importMapOutputFile?.trim()) {
      return false;
    }
  }

  await fs.writeFile(importMapFilePath, importMapOutputFile);
  return true;
}
