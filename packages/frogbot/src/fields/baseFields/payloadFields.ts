import {
  createCreatedByField as payloadCreatedByField,
  createFolderField as payloadFolderField,
  createTagField as payloadTagField,
  createUpdatedByField as payloadUpdatedByField,
} from 'payload';

import { fromPayloadField } from '../../seams/config.js';
import type { RelationshipField } from '../config/types.js';

function relationship(field: ReturnType<typeof payloadFolderField>): RelationshipField {
  const converted = fromPayloadField(field);

  if (converted.type !== 'relationship') {
    throw new Error('[frogbot] Expected a relationship field.');
  }

  return converted;
}

/** Payload's `createdBy` field, to customize it in a collection's `fields`. */
export function createCreatedByField(
  args?: Parameters<typeof payloadCreatedByField>[0],
): RelationshipField {
  return relationship(payloadCreatedByField(args));
}

/** Payload's `updatedBy` field, to customize it in a collection's `fields`. */
export function createUpdatedByField(
  args?: Parameters<typeof payloadUpdatedByField>[0],
): RelationshipField {
  return relationship(payloadUpdatedByField(args));
}

/** Payload's folder field: files a record into a collection with `folders: true`. */
export function createFolderField(
  args: Parameters<typeof payloadFolderField>[0],
): RelationshipField {
  return relationship(payloadFolderField(args));
}

/** Payload's tag field: tags a record from a collection with `tags: true`. */
export function createTagField(args: Parameters<typeof payloadTagField>[0]): RelationshipField {
  return relationship(payloadTagField(args));
}
