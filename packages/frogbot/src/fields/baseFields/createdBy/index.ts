import type { FieldHook, RelationshipField } from '../../config/types.js';
import {
  buildUserKindField,
  fieldRelationTo,
  relationshipID,
  requestUserID,
  type UserKindFieldArgs,
} from '../userKind.js';

export type CreatedByFieldArgs = UserKindFieldArgs;

const setCreatedBy: FieldHook = ({ field, operation, previousValue, req, value }) => {
  if (operation !== 'create') return relationshipID(previousValue);

  if (value !== undefined && value !== null) return relationshipID(value);

  return requestUserID({ req, relationTo: fieldRelationTo(field) });
};

export function createdByField(args: CreatedByFieldArgs): RelationshipField {
  return buildUserKindField(args, {
    factory: 'createdByField',
    type: 'createdBy',
    description: 'Set by FrogBot to the user who created the record; read-only',
    beforeChange: setCreatedBy,
  });
}
