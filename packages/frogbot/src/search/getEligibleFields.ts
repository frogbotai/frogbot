import type { CollectionConfig } from '../collections/config/types.js';
import type { Field } from '../fields/config/types.js';
import type { SearchFilterField } from './types.js';

export type SearchFieldNode = {
  field: Field;
  path: string;
  localized: boolean;
  repeated: boolean;
  stored: boolean;
  readGuarded: boolean;
};

type Ancestry = Omit<SearchFieldNode, 'field'>;

const credentialSegment =
  /^(password|hash|salt|token|credentials|privatekey|apikey|apisecret|accesstoken|refreshtoken|secret|clientsecret|connectionstring|resetpasswordtoken|resetpasswordexpiration|verificationtoken|verificationcode|_verified|loginattempts|lockuntil)$/i;

function joinPath(parent: string, name: string): string {
  return name ? [parent, name].filter(Boolean).join('.') : parent;
}

export function getFieldNodes(fields: readonly Field[]): Map<string, SearchFieldNode[]> {
  const nodes = new Map<string, SearchFieldNode[]>();

  function visit(items: readonly Field[], parent: Ancestry): void {
    for (const field of items) {
      const name = 'name' in field && typeof field.name === 'string' ? field.name : '';

      const node: SearchFieldNode = {
        field,
        path: joinPath(parent.path, name),
        localized: parent.localized || ('localized' in field && field.localized === true),
        repeated: parent.repeated || field.type === 'array' || field.type === 'blocks',
        stored:
          parent.stored &&
          !('virtual' in field && Boolean(field.virtual)) &&
          !('hidden' in field && field.hidden === true),
        readGuarded: parent.readGuarded || ('access' in field && Boolean(field.access?.read)),
      };

      if (name) nodes.set(node.path, [...(nodes.get(node.path) ?? []), node]);

      if (field.type === 'tabs') {
        for (const tab of field.tabs) {
          const tabName = 'name' in tab && typeof tab.name === 'string' ? tab.name : '';

          visit(tab.fields, {
            path: joinPath(node.path, tabName),
            localized: node.localized || ('localized' in tab && tab.localized === true),
            repeated: node.repeated,
            stored:
              node.stored &&
              !('virtual' in tab && Boolean(tab.virtual)) &&
              !('hidden' in tab && tab.hidden === true),
            readGuarded: node.readGuarded || ('access' in tab && Boolean(tab.access?.read)),
          });
        }
      } else if (field.type === 'blocks') {
        for (const block of [...field.blocks, ...(field.blockReferences ?? [])]) {
          if (typeof block === 'string') continue;

          visit(block.fields, { ...node, repeated: true });
        }
      } else if ('fields' in field && Array.isArray(field.fields)) {
        visit(field.fields, node);
      }
    }
  }

  visit(fields, { path: '', localized: false, repeated: false, stored: true, readGuarded: false });

  return nodes;
}

function getFilterType(field: Field): SearchFilterField['type'] | undefined {
  switch (field.type) {
    case 'checkbox':
      return 'boolean';
    case 'date':
      return 'date';
    case 'number':
      return 'number';
    case 'email':
    case 'radio':
    case 'select':
    case 'text':
    case 'textarea':
      return 'string';
    case 'relationship':
    case 'upload':
      return typeof field.relationTo === 'string' ? 'id' : undefined;
    default:
      return undefined;
  }
}

function isCredentialPath(path: string): boolean {
  return path.split('.').some((segment) => credentialSegment.test(segment));
}

export function getEligibleFields({
  collection,
  nodes,
  localizeStatus,
}: {
  collection: CollectionConfig;
  nodes: Map<string, SearchFieldNode[]>;
  localizeStatus: boolean;
}): SearchFilterField[] {
  const candidates: SearchFilterField[] = [
    { path: 'id', type: 'id', localized: false, many: false },
  ];

  if (collection.timestamps !== false) {
    candidates.push(
      { path: 'createdAt', type: 'date', localized: false, many: false },
      { path: 'updatedAt', type: 'date', localized: false, many: false },
    );
  }

  if (collection.trash) {
    candidates.push({ path: 'deletedAt', type: 'date', localized: false, many: false });
  }

  if (
    collection.versions &&
    typeof collection.versions === 'object' &&
    collection.versions.drafts
  ) {
    candidates.push({ path: '_status', type: 'string', localized: localizeStatus, many: false });
  }

  for (const [path, matches] of nodes) {
    if (matches.length !== 1 || isCredentialPath(path)) continue;

    if (path === 'id' || path === '_status' || (path === 'deletedAt' && collection.trash)) {
      continue;
    }

    const [{ field, localized, repeated, stored, readGuarded }] = matches;
    const type = getFilterType(field);

    if (!type || repeated || !stored || readGuarded) continue;

    const many = 'hasMany' in field && field.hasMany === true;

    candidates.push({ path, type, localized, many });
  }

  return [...new Map(candidates.map((field) => [field.path, field])).values()];
}
