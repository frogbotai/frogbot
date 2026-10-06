import type { FieldHook, RelationshipField } from '../../config/types.js';
import { AI_FIELD_RUN_CONTEXT } from '../ai/hooks.js';
import {
  buildUserKindField,
  fieldRelationTo,
  relationshipID,
  requestUserID,
  type UserKindFieldArgs,
} from '../userKind.js';

export type LastModifiedByFieldArgs = UserKindFieldArgs;

const setLastModifiedBy: FieldHook = ({ context, field, operation, previousValue, req, value }) => {
  if (operation === 'create' && value !== undefined && value !== null) {
    return relationshipID(value);
  }

  const aiRun = context?.[AI_FIELD_RUN_CONTEXT];

  if (operation !== 'create' && aiRun) return relationshipID(previousValue);

  const user = requestUserID({ req, relationTo: fieldRelationTo(field) });

  if (operation === 'create') return user;

  return user ?? relationshipID(previousValue);
};

export function lastModifiedByField(args: LastModifiedByFieldArgs): RelationshipField {
  return buildUserKindField(args, {
    factory: 'lastModifiedByField',
    type: 'lastModifiedBy',
    description: 'Set by FrogBot to the user who last saved the record; read-only',
    beforeChange: setLastModifiedBy,
  });
}
