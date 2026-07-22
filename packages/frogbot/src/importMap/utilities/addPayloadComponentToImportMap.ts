import crypto from 'node:crypto';
import path from 'node:path';

import type { PayloadComponent } from 'payload';

import { parsePayloadComponent } from 'payload/shared';

import type { Imports, InternalImportMap } from '../index.js';

function getAdjustedComponentPath(importMapToBaseDirPath: string, componentPath: string): string {
  const normalizedBasePath = importMapToBaseDirPath.replace(/\\/g, '/');
  const normalizedComponentPath = componentPath.replace(/\\/g, '/');

  if (normalizedBasePath.startsWith('./')) {
    const cleanComponentPath = normalizedComponentPath.startsWith('./')
      ? normalizedComponentPath.substring(2)
      : normalizedComponentPath;

    return `${normalizedBasePath}${cleanComponentPath}`;
  }

  return path.posix.join(normalizedBasePath, normalizedComponentPath);
}

export function addPayloadComponentToImportMap({
  importMap,
  importMapToBaseDirPath,
  imports,
  payloadComponent,
}: {
  importMap: InternalImportMap;
  importMapToBaseDirPath: string;
  imports: Imports;
  payloadComponent: PayloadComponent;
}): {
  path: string;
  specifier: string;
} | null {
  if (!payloadComponent) {
    return null;
  }
  const { exportName, path: componentPath } = parsePayloadComponent(payloadComponent);

  if (importMap[componentPath + '#' + exportName]) {
    return null;
  }

  const importIdentifier =
    exportName + '_' + crypto.createHash('md5').update(componentPath).digest('hex');

  importMap[componentPath + '#' + exportName] = importIdentifier;

  const isRelativePath = componentPath.startsWith('.') || componentPath.startsWith('/');

  if (isRelativePath) {
    const adjustedComponentPath = getAdjustedComponentPath(importMapToBaseDirPath, componentPath);

    imports[importIdentifier] = {
      path: adjustedComponentPath,
      specifier: exportName,
    };
    return {
      path: adjustedComponentPath,
      specifier: exportName,
    };
  } else {
    imports[importIdentifier] = {
      path: componentPath,
      specifier: exportName,
    };
    return {
      path: componentPath,
      specifier: exportName,
    };
  }
}
