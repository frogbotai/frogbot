export const OPTIONAL_PEERS = ['@payloadcms/translations', '@payloadcms/ui', 'frogbot', 'payload'];

const FRAMEWORK_PACKAGES = ['next', '@payloadcms/next'];

const PAYLOAD_PACKAGE = /^(?:frogbot|payload|@payloadcms\/.+)$/;

const INSTALLED_FIELDS = ['dependencies', 'optionalDependencies'];

const MANIFEST_FIELDS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
  'peerDependenciesMeta',
];

const STORE_BANS = /^(?:frogbot@|payload@|next@|@payloadcms\+)/;

const SERVER_IMPORT =
  /(?:\bfrom\s*|\bimport\s*\(\s*|^\s*import\s+)['"](?:frogbot|@frogbotai\/sdk)(?:\/[^'"]*)?['"]/m;

const SERVER_DECLARATIONS = /^dist\/(?:admin\/|chat\/rest\/|exports\/chat-rest\.d\.ts$)/;

export function uiManifestProblems(manifest) {
  const problems = [];
  const peers = manifest.peerDependencies ?? {};

  for (const field of INSTALLED_FIELDS) {
    for (const name of Object.keys(manifest[field] ?? {})) {
      if (PAYLOAD_PACKAGE.test(name)) problems.push(`${field}.${name}`);
    }
  }

  for (const name of Object.keys(peers)) {
    if (PAYLOAD_PACKAGE.test(name) && manifest.peerDependenciesMeta?.[name]?.optional !== true) {
      problems.push(`peerDependenciesMeta.${name}.optional`);
    }
  }

  for (const name of OPTIONAL_PEERS) {
    if (!Object.hasOwn(peers, name)) problems.push(`peerDependencies.${name}`);

    if (!Object.hasOwn(manifest.devDependencies ?? {}, name)) {
      problems.push(`devDependencies.${name}`);
    }
  }

  for (const field of MANIFEST_FIELDS) {
    for (const name of FRAMEWORK_PACKAGES) {
      if (Object.hasOwn(manifest[field] ?? {}, name)) problems.push(`${field}.${name}`);
    }
  }

  return problems;
}

export function storeProblems(entries) {
  return entries.filter((entry) => STORE_BANS.test(entry));
}

export function declarationProblems(files) {
  return files
    .filter(({ file }) => file.endsWith('.d.ts') && !SERVER_DECLARATIONS.test(file))
    .filter(({ text }) => SERVER_IMPORT.test(text))
    .map(({ file }) => file);
}
